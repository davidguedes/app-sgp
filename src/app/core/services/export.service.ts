import { inject, Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { Patient, PatientDetail } from '../models/patient.model';
import { AvulsoAttendance } from '../models/attendance.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  authService = inject(AuthService);
  professionalsMap = this.authService.professionalsMap;

  private readonly MAX_CELL_LENGTH = 32000;

  private truncate(value: unknown, max = this.MAX_CELL_LENGTH): string {
    if (value === null || value === undefined) return '-';
    const str = String(value);
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  private sanitizeSheetName(name: string): string {
    return name.replace(/[\/\\?\*\[\]:]/g, '').substring(0, 31).trim() || 'Sheet';
  }

  private writeFileAsync(wb: XLSX.WorkBook, fileName: string): void {
    setTimeout(() => XLSX.writeFile(wb, fileName, { compression: true }), 0);
  }

  // ─────────────────────────────────────────────
  // HELPERS: modalidade e pro-rata
  // ─────────────────────────────────────────────

  private tipoLabel(tipo: Patient['tipo']): string {
    const map: Record<string, string> = {
      fixo:         'Fixo',
      experimental: 'Experimental',
      convenio:     'Convênio',
    };
    return map[tipo] ?? tipo;
  }

  /**
   * Calcula quantas ocorrências dos dias do aluno existem no mês de referência,
   * considerando apenas a partir de data_inicio (caso o aluno tenha entrado no meio do mês).
   *
   * Retorna { totalAulasNoMes, aulasAPartirDoInicio, fatorProRata }
   * onde fatorProRata = aulasAPartirDoInicio / totalAulasNoMes (entre 0 e 1).
   *
   * Lógica:
   *   1. Monta a lista de dias-da-semana que o aluno tem aula (ex: ['seg','qua','sex'])
   *   2. Itera todos os dias do mês e conta quantos coincidem com esses dias
   *   3. Repete a contagem só para os dias >= data_inicio
   *   4. O pro-rata é a razão entre os dois contadores
   */
  private calcProRata(patient: Patient, refDate: Date): { totalAulasNoMes: number; aulasAPartirDoInicio: number; fatorProRata: number } {
    const DAY_MAP: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
    const diasAluno = new Set(patient.dias.map(d => DAY_MAP[d]).filter(n => n !== undefined));

    const ano = refDate.getFullYear();
    const mes = refDate.getMonth();   // 0-indexed
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();

    const inicio = new Date(patient.data_inicio);
    inicio.setHours(0, 0, 0, 0);

    let totalAulasNoMes = 0;
    let aulasAPartirDoInicio = 0;

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const d = new Date(ano, mes, dia);
      if (!diasAluno.has(d.getDay())) continue;
      totalAulasNoMes++;
      if (d >= inicio) aulasAPartirDoInicio++;
    }

    const fatorProRata = totalAulasNoMes > 0 ? aulasAPartirDoInicio / totalAulasNoMes : 1;
    return { totalAulasNoMes, aulasAPartirDoInicio, fatorProRata };
  }

  /**
   * Exporta lista leve de pacientes.
   * attendance[] e evolutions[] não existem aqui — usa total_attendance e total_evolutions (contagens do backend).
   *
   * Melhorias:
   *  - Coluna "Modalidade" com label legível (Fixo / Experimental / Convênio)
   *  - Cálculo pro-rata quando data_inicio está no mês atual
   *    → exibe "Pacote (pro-rata)" com o valor proporcional e uma observação na célula
   */
  exportPatientsToExcel(patients: Patient[], userName: string, userRole: string, avulsos: AvulsoAttendance[] = []): void {
    if (!patients?.length) { console.warn('Nenhum paciente para exportar'); return; }

    const hoje = new Date();

    // ── Aba 1: Alunos regulares ───────────────────────────────────────────
    const data: any[][] = [
      ['STUDIO PILATES - RELATÓRIO COMPLETO'],
      [`Usuário: ${userName} (${userRole === 'gestor' ? 'Gestor' : 'Profissional'})`],
      [`Gerado em: ${hoje.toLocaleString('pt-BR')}`],
      [],
      ['Nome', 'Profissional', 'Modalidade', 'Dias', 'Início', 'Total Aulas', 'Total Evoluções', 'Pacote', 'Pacote no Mês', 'Líquido no Mês', 'Obs Pro-Rata']
    ];

    let totalPacoteMes = 0;
    let totalLiquidoMes = 0;

    patients.forEach(p => {
      const { totalAulasNoMes, aulasAPartirDoInicio, fatorProRata } = this.calcProRata(p, hoje);

      const inicio = new Date(p.data_inicio);
      const entrandoNesteMes =
        inicio.getFullYear() === hoje.getFullYear() &&
        inicio.getMonth()    === hoje.getMonth()    &&
        inicio.getDate()     > 1;

      const pacoteNoMes = entrandoNesteMes ? p.valor * fatorProRata : p.valor;
      const ganhoNoMes  = entrandoNesteMes ? p.ganho * fatorProRata : p.ganho;

      totalPacoteMes  += pacoteNoMes;
      totalLiquidoMes += ganhoNoMes;

      const obsProRata = entrandoNesteMes
        ? `Iniciou dia ${inicio.getDate()} — ${aulasAPartirDoInicio}/${totalAulasNoMes} aulas`
        : '';

      data.push([
        this.truncate(p.nome),
        this.truncate(this.professionalsMap()[p.profissional_id]),
        this.tipoLabel(p.tipo),
        p.dias.map(d => d.toUpperCase()).join(', '),
        inicio.toLocaleDateString('pt-BR'),
        p.total_attendance ?? '-',
        p.total_evolutions ?? '-',
        `R$ ${p.valor.toFixed(2)}`,
        `R$ ${pacoteNoMes.toFixed(2)}`,
        `R$ ${ganhoNoMes.toFixed(2)}`,
        obsProRata
      ]);
    });

    // Total de avulsas do mês para somar na linha de totais
    const totalAvulsosMes = avulsos.reduce((s, a) => s + Number(a.valor ?? 0), 0);

    // Linha de totais
    data.push([]);
    data.push([
      `TOTAL (${patients.length} alunos)`, '', '', '', '', '', '',
      `R$ ${patients.reduce((s, p) => s + p.valor, 0).toFixed(2)}`,
      `R$ ${totalPacoteMes.toFixed(2)}`,
      `R$ ${totalLiquidoMes.toFixed(2)}`,
      ''
    ]);
    if (avulsos.length) {
      data.push([
        `Aulas avulsas (${avulsos.length} aula${avulsos.length > 1 ? 's' : ''})`,
        '', '', '', '', '', '', '',
        `R$ ${totalAvulsosMes.toFixed(2)}`,
        `R$ ${totalAvulsosMes.toFixed(2)}`,
        'Valor bruto das avulsas'
      ]);
      data.push([
        'TOTAL GERAL', '', '', '', '', '', '', '',
        `R$ ${(totalPacoteMes + totalAvulsosMes).toFixed(2)}`,
        `R$ ${(totalLiquidoMes + totalAvulsosMes).toFixed(2)}`,
        ''
      ]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 25 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
      { wch: 13 }, { wch: 15 }, { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Alunos');

    // ── Aba 2: Aulas Avulsas (só se existirem no mês) ────────────────────
    if (avulsos.length) {
      const mesAno = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const avulsoData: any[][] = [
        ['AULAS AVULSAS DO MÊS'],
        [`Período: ${mesAno}`],
        [`Gerado em: ${hoje.toLocaleString('pt-BR')}`],
        [],
        ['Data', 'Aluno', 'Profissional', 'Valor', 'Observações']
      ];

      [...avulsos]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .forEach(av => {
          avulsoData.push([
            new Date(av.date).toLocaleDateString('pt-BR'),
            this.truncate(av.patient_nome),
            this.truncate(this.professionalsMap()[av.profissional_id]),
            `R$ ${Number(av.valor ?? 0).toFixed(2)}`,
            this.truncate(av.notes || '-')
          ]);
        });

      avulsoData.push([]);
      avulsoData.push(['TOTAL', '', '', `R$ ${totalAvulsosMes.toFixed(2)}`, '']);

      const wsAv = XLSX.utils.aoa_to_sheet(avulsoData);
      wsAv['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, wsAv, 'Avulsas');
    }

    this.writeFileAsync(wb, `pilates-${hoje.toISOString().split('T')[0]}.xlsx`);
  }

  /**
   * Exporta detalhes de um paciente — recebe PatientDetail (com attendance[] e evolutions[]).
   */
  exportPatientDetail(patient: PatientDetail): void {
    const data: any[][] = [
      ['RELATÓRIO INDIVIDUAL DO ALUNO'],
      [`Aluno: ${this.truncate(patient.nome)}`],
      [`Profissional: ${this.truncate(this.professionalsMap()[patient.profissional_id])}`],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
      [],
      ['DADOS GERAIS'],
      ['Dias de aula:', patient.dias.map(d => d.toUpperCase()).join(', ')],
      ['Valor pacote:', `R$ ${patient.valor.toFixed(2)}`],
      ['Porcentagem:', `${patient.porcentagem}%`],
      ['Ganho líquido:', `R$ ${patient.ganho.toFixed(2)}`],
      [],
      ['FREQUÊNCIA'],
      ['Data', 'Status', 'Observações']
    ];

    if (patient.attendance?.length) {
      [...patient.attendance]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .forEach(att => {
          const label = att.status === 'present' ? 'Presente' : att.status === 'absent' ? 'Faltou' : 'Reposição';
          data.push([new Date(att.date).toLocaleDateString('pt-BR'), label, this.truncate(att.notes || '-')]);
        });
    } else {
      data.push(['Nenhum registro de frequência']);
    }

    data.push([], ['EVOLUÇÕES'], ['Data', 'Eva', 'Exercícios', 'Notas', 'Autor']);

    if (patient.evolutions?.length) {
      [...patient.evolutions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .forEach(evo => {
          data.push([
            new Date(evo.date).toLocaleDateString('pt-BR'),
            this.truncate(evo.eva),
            this.truncate(evo.exercises),
            this.truncate(evo.notes),
            this.truncate(evo.author)
          ]);
        });
    } else {
      data.push(['Nenhuma evolução registrada']);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 50 }, { wch: 50 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, this.sanitizeSheetName(patient.nome));

    const safeName = patient.nome.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
    this.writeFileAsync(wb, `${safeName}-${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  /**
   * Relatório consolidado de frequência — recebe PatientDetail[] pois precisa de attendance[].
   */
  exportAttendanceReport(patients: PatientDetail[], startDate: Date, endDate: Date): void {
    const data: any[][] = [
      ['RELATÓRIO DE FREQUÊNCIA'],
      [`Período: ${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
      [],
      ['Aluno', 'Total Aulas', 'Presenças', 'Faltas', 'Reposições', 'Taxa Presença']
    ];

    patients.forEach(p => {
      const filtered = p.attendance.filter(a => {
        const d = new Date(a.date);
        return d >= startDate && d <= endDate;
      });
      const presencas  = filtered.filter(a => a.status === 'present').length;
      const faltas     = filtered.filter(a => a.status === 'absent').length;
      const reposicoes = filtered.filter(a => a.status === 'makeup').length;
      const total      = presencas + faltas;
      data.push([
        this.truncate(p.nome), total, presencas, faltas, reposicoes,
        `${total > 0 ? ((presencas / total) * 100).toFixed(1) : '0'}%`
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Frequência');
    this.writeFileAsync(wb, `frequencia-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.xlsx`);
  }
}