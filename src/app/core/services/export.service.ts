import { inject, Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { Patient, PatientDetail } from '../models/patient.model';
import { AvulsoAttendance } from '../models/attendance.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  authService     = inject(AuthService);
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

  private tipoLabel(tipo: Patient['tipo']): string {
    const map: Record<string, string> = {
      fixo:         'Fixo',
      experimental: 'Experimental',
      convenio:     'Convênio',
    };
    return map[tipo] ?? tipo;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // calcProRata
  //
  // Calcula a proporção de aulas do aluno dentro do período de referência,
  // considerando que ele pode ter iniciado no meio do período.
  //
  // CORREÇÃO em relação à versão anterior:
  //   - Antes: comparava data_inicio com "hoje" (new Date()), o que quebrava
  //     exportações de meses anteriores (o aluno sempre pareceria "veterano")
  //   - Agora: recebe refStart como referência, que é o início do período
  //     selecionado pelo usuário — funciona para qualquer mês histórico
  //
  // Exemplo:
  //   Aluno com dias ['seg','qua','sex'], iniciou dia 15/03 em março com 14 dias úteis:
  //   - totalAulasNoMes = 14 (todas as seg/qua/sex de março)
  //   - aulasAPartirDoInicio = 7 (só as do dia 15 em diante)
  //   - fatorProRata = 7/14 = 0.5
  // ─────────────────────────────────────────────────────────────────────────
  private calcProRata(
    patient: Patient,
    refStart: Date   // início do período de referência (não "hoje")
  ): { totalAulasNoMes: number; aulasAPartirDoInicio: number; fatorProRata: number } {
    const DAY_MAP: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
    const diasAluno = new Set(patient.dias.map(d => DAY_MAP[d]).filter(n => n !== undefined));

    const ano         = refStart.getFullYear();
    const mes         = refStart.getMonth();
    const diasNoMes   = new Date(ano, mes + 1, 0).getDate();

    const inicio = new Date(patient.data_inicio);
    inicio.setHours(0, 0, 0, 0);

    let totalAulasNoMes       = 0;
    let aulasAPartirDoInicio  = 0;

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const d = new Date(ano, mes, dia);
      if (!diasAluno.has(d.getDay())) continue;
      totalAulasNoMes++;
      if (d >= inicio) aulasAPartirDoInicio++;
    }

    const fatorProRata = totalAulasNoMes > 0 ? aulasAPartirDoInicio / totalAulasNoMes : 1;
    return { totalAulasNoMes, aulasAPartirDoInicio, fatorProRata };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // exportPatientsToExcel
  //
  // MUDANÇA: agora usa ganho_liquido_periodo em vez de p.ganho diretamente.
  // O valor já vem calculado pelo backend para o período informado —
  // fixo usa ganho, convênio usa ganho × aulas_realizadas no período.
  //
  // O pro-rata ainda é aplicado aqui para o caso de o aluno ter iniciado
  // no MEIO do período exportado, ajustando o valor proporcionalmente.
  // ─────────────────────────────────────────────────────────────────────────
  exportPatientsToExcel(
    patients:  Patient[],
    userName:  string,
    userRole:  string,
    avulsos:   AvulsoAttendance[] = [],
    startDate?: Date,
    endDate?:   Date
  ): void {
    if (!patients?.length) { console.warn('Nenhum paciente para exportar'); return; }

    const hoje     = new Date();
    const refStart = startDate ?? new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const refEnd   = endDate   ?? new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const periodoLabel = refStart.getMonth() === refEnd.getMonth() && refStart.getFullYear() === refEnd.getFullYear()
      ? refStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : `${refStart.toLocaleDateString('pt-BR')} a ${refEnd.toLocaleDateString('pt-BR')}`;

    const data: any[][] = [
      ['STUDIO PILATES - FECHAMENTO FINANCEIRO'],
      [`Período: ${periodoLabel}`],
      [`Usuário: ${userName} (${userRole === 'gestor' ? 'Gestor' : 'Profissional'})`],
      [`Gerado em: ${hoje.toLocaleString('pt-BR')}`],
      [],
      ['Nome', 'Profissional', 'Modalidade', 'Dias', 'Início', 'Total Aulas', 'Total Evoluções', 'Pacote', 'Líquido no Período']
      //['Nome', 'Profissional', 'Modalidade', 'Dias', 'Início', 'Total Aulas', 'Total Evoluções', 'Pacote', 'Líquido no Período', 'Líquido (pro-rata)', 'Obs Pro-Rata']
    ];

    let totalLiquidoPeriodo  = 0;
    let totalLiquidoProRata  = 0;

    patients.forEach(p => {
      const inicio = new Date(p.data_inicio);

      // Pro-rata: só aplica se o aluno iniciou DENTRO do período de referência
      // (ou seja, depois do primeiro dia do mês/período)
      const entrandoNoPeriodo = inicio >= refStart && inicio.getDate() > 1
        // garante que é no mesmo mês/período
        && inicio.getFullYear() === refStart.getFullYear()
        && inicio.getMonth()    === refStart.getMonth();

      const { totalAulasNoMes, aulasAPartirDoInicio, fatorProRata } =
        this.calcProRata(p, refStart);  // passa refStart, não "hoje"

      // ganho_liquido_periodo já vem correto do backend (fixo ou convênio)
      const liquidoPeriodo = p.ganho_liquido_periodo;
      const liquidoProRata = entrandoNoPeriodo ? liquidoPeriodo * fatorProRata : liquidoPeriodo;

      totalLiquidoPeriodo += liquidoPeriodo;
      totalLiquidoProRata  += liquidoProRata;

      const obsProRata = entrandoNoPeriodo
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
        `R$ ${liquidoPeriodo.toFixed(2)}`,
        //`R$ ${liquidoProRata.toFixed(2)}`,
        //obsProRata
      ]);
    });

    const totalAvulsosMes = avulsos.reduce((s, a) => s + Number(a.valor ?? 0), 0);

    data.push([]);
    data.push([
      `TOTAL (${patients.length} alunos)`, '', '', '', '', '', '',
      `R$ ${patients.reduce((s, p) => s + p.valor, 0).toFixed(2)}`,
      `R$ ${totalLiquidoPeriodo.toFixed(2)}`,
      //`R$ ${totalLiquidoProRata.toFixed(2)}`,
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
        `R$ ${(totalLiquidoPeriodo + totalAvulsosMes).toFixed(2)}`,
        `R$ ${(totalLiquidoProRata + totalAvulsosMes).toFixed(2)}`,
        ''
      ]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 25 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
      { wch: 13 }, { wch: 15 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Alunos');

    if (avulsos.length) {
      const avulsoData: any[][] = [
        ['AULAS AVULSAS DO PERÍODO'],
        [`Período: ${periodoLabel}`],
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

    const fileTag = refStart.getMonth() === refEnd.getMonth()
      ? `${String(refStart.getMonth() + 1).padStart(2, '0')}-${refStart.getFullYear()}`
      : `${refStart.toISOString().split('T')[0]}_${refEnd.toISOString().split('T')[0]}`;

    this.writeFileAsync(wb, `pilates-fechamento-${fileTag}.xlsx`);
  }

  exportPatientDetail(patient: PatientDetail): void {
    const data: any[][] = [
      ['RELATÓRIO INDIVIDUAL DO ALUNO'],
      [`Aluno: ${this.truncate(patient.nome)}`],
      [`Profissional: ${this.truncate(this.professionalsMap()[patient.profissional_id])}`],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
      [],
      ['DADOS GERAIS'],
      ['Dias de aula:', patient.dias.map(d => d.toUpperCase()).join(', ')],
      ['Modalidade:',  patient.tipo === 'convenio' ? 'Convênio' : patient.tipo === 'fixo' ? 'Fixo' : 'Experimental'],
      ['Valor pacote:', `R$ ${patient.valor.toFixed(2)}`],
      ['Porcentagem:',  `${patient.porcentagem}%`],
      ['Ganho líquido período:', `R$ ${patient.ganho_liquido_periodo.toFixed(2)}`],
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

  exportAttendanceReport(patients: PatientDetail[], startDate: Date, endDate: Date): void {
    const data: any[][] = [
      ['RELATÓRIO DE FREQUÊNCIA'],
      [`Período: ${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
      [],
      ['Aluno', 'Total Aulas', 'Presenças', 'Faltas', 'Reposições', 'Taxa Presença']
    ];

    patients.forEach(p => {
      const filtered   = p.attendance.filter(a => {
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