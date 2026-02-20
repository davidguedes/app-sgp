import { Injectable, ApplicationRef, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs/operators';
import { interval, concat } from 'rxjs';
import { signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private swUpdate = inject(SwUpdate);
  private appRef   = inject(ApplicationRef);

  /** true quando uma nova versão está disponível e aguardando ação do usuário */
  readonly updateAvailable = signal(false);


  constructor() {
    if (!this.swUpdate.isEnabled) return;

    this._listenForUpdates();
    this._pollForUpdates();
  }

  /** Aplica a atualização: recarrega para ativar o novo SW */
  applyUpdate(): void {
    this.swUpdate.activateUpdate().then(() => location.reload());
  }

  /** Descarta o banner sem atualizar */
  dismiss(): void {
    this.updateAvailable.set(false);
  }

  // ─────────────────────────────────────────────
  // PRIVADO
  // ─────────────────────────────────────────────

  private _listenForUpdates(): void {
    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateAvailable.set(true));
  }

  /**
   * Força o SW a checar por atualizações periodicamente.
   * Aguarda o app estabilizar (sem tarefas pendentes) antes de começar,
   * depois checa a cada 6 horas.
   */
  private _pollForUpdates(): void {
    const appIsStable$  = this.appRef.isStable.pipe(first(isStable => isStable));
    const everyFiveHours$ = interval(6 * 60 * 60 * 1000);

    concat(appIsStable$, everyFiveHours$).subscribe(() => {
      this.swUpdate.checkForUpdate().catch(() => {});
    });
  }
}