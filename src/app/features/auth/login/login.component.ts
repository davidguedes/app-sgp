import {
  Component,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/services/auth.service';
import { LoginCredentials } from '../../../core/models/user.model';

// ─── Tipagem interna da partícula ─────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;   // velocidade horizontal
  vy: number;   // velocidade vertical
  radius: number;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    MessageModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements AfterViewInit, OnDestroy {

  // ── Formulário ──────────────────────────────────────────────────────────────
  credentials = signal<LoginCredentials>({ email: '', senha: '' });
  loading      = signal(false);
  errorMessage = signal<string | null>(null);

  // ── Referência ao <canvas> do template ─────────────────────────────────────
  // @ViewChild captura o elemento pelo template reference variable (#bgCanvas)
  @ViewChild('bgCanvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  // ── Estado interno da animação ──────────────────────────────────────────────
  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animFrameId = 0;          // ID do requestAnimationFrame (para cancelar)
  private resizeObserver!: ResizeObserver;

  /**
   * Em vez de cores hardcoded, lemos a variável --sage definida no _theme.scss.
   * getComputedStyle(document.documentElement) acessa os valores das
   * CSS custom properties do :root — que já mudam automaticamente
   * com @media (prefers-color-scheme: dark).
   *
   * Fazemos isso como getter (calculado na hora) para que,
   * se o usuário mudar o tema do SO durante a sessão, as cores se adaptem.
   */
  private get dotColor(): string {
    const sage = getComputedStyle(document.documentElement)
      .getPropertyValue('--sage').trim();
    // sage retorna algo como "#8eb892" — convertemos para rgba com opacidade
    return this.hexToRgba(sage, 0.7);
  }

  private get lineAlphaBase(): number {
    // No dark mode as linhas podem ser um pouco mais visíveis
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 0.35 : 0.25;
  }

  /** Converte #rrggbb para rgba(r, g, b, a) */
  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private readonly PARTICLE_COUNT  = 55;    // menos = mais leve
  private readonly MAX_DISTANCE    = 140;   // px — distância máxima para ligar pontos
  private readonly SPEED           = 0.35;  // velocidade base das partículas

  // ── Ciclo de vida Angular ───────────────────────────────────────────────────

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  /**
   * ngAfterViewInit é chamado DEPOIS que o template foi renderizado no DOM.
   * É o lugar correto para acessar elementos via @ViewChild,
   * pois antes disso o canvas ainda não existe.
   */
  ngAfterViewInit(): void {
    this.initCanvas();
    this.spawnParticles();
    this.animate();

    // Redimensiona o canvas se a janela mudar de tamanho
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(document.documentElement);
  }

  /**
   * ngOnDestroy: limpeza obrigatória para evitar memory leak.
   * Sempre cancele animações e observers quando o componente for destruído.
   */
  ngOnDestroy(): void {
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
  }

  // ── Canvas: inicialização ───────────────────────────────────────────────────

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();
  }

  /** Ajusta width/height do canvas ao tamanho real da janela */
  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // ── Canvas: partículas ─────────────────────────────────────────────────────

  /**
   * Cria as partículas com posição e velocidade aleatórias.
   * Math.random() retorna [0, 1); multiplicamos pelo range desejado.
   */
  private spawnParticles(): void {
    const { innerWidth: w, innerHeight: h } = window;

    this.particles = Array.from({ length: this.PARTICLE_COUNT }, () => ({
      x:      Math.random() * w,
      y:      Math.random() * h,
      // vx/vy: entre -SPEED e +SPEED, direção aleatória
      vx:     (Math.random() - 0.5) * this.SPEED * 2,
      vy:     (Math.random() - 0.5) * this.SPEED * 2,
      radius: Math.random() * 1.8 + 1.2,   // raio entre 1.2 e 3px
    }));
  }

  // ── Canvas: loop de animação ───────────────────────────────────────────────

  /**
   * requestAnimationFrame(callback) chama o callback na próxima repintura
   * do browser (~60x por segundo). Guardamos o ID para poder cancelar
   * em ngOnDestroy com cancelAnimationFrame(id).
   */
  private animate(): void {
    this.animFrameId = requestAnimationFrame(() => this.animate());
    this.draw();
  }

  private draw(): void {
    const { ctx } = this;
    const { width: w, height: h } = this.canvasRef.nativeElement;

    // 1. Limpa o frame anterior
    ctx.clearRect(0, 0, w, h);

    // 2. Move e rebate as partículas nas bordas
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;

      // Inversão de velocidade ao atingir borda (efeito "bounce")
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }

    // 3. Desenha linhas entre partículas próximas
    //    Complexidade O(n²) — por isso mantemos n baixo (55 pontos)
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i];
        const b = this.particles[j];

        const dx   = a.x - b.x;
        const dy   = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.MAX_DISTANCE) {
          // Opacidade da linha diminui com a distância (mais longe = mais transparente)
          const alpha = (1 - dist / this.MAX_DISTANCE) * this.lineAlphaBase;

          ctx.beginPath();
          ctx.strokeStyle = this.hexToRgba(
            getComputedStyle(document.documentElement).getPropertyValue('--sage').trim(),
            alpha
          );
          ctx.lineWidth   = 0.8;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // 4. Desenha os pontos por cima das linhas
    const dotColor = this.dotColor;
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
    }
  }

  // ── Formulário ──────────────────────────────────────────────────────────────

  onSubmit(): void {
    if (!this.credentials().email || !this.credentials().senha) {
      this.errorMessage.set('Por favor, preencha todos os campos');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.authService.login(this.credentials()).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.loading.set(false);
        this.errorMessage.set('Email ou senha inválidos');
        console.error('Erro no login:', error);
      }
    });
  }

  updateEmail(value: string): void {
    this.credentials.update(c => ({ ...c, email: value }));
  }

  updateSenha(value: string): void {
    this.credentials.update(c => ({ ...c, senha: value }));
  }
}