import { inject, Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { Patient, PatientDetail } from '../models/patient.model';
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

  /**
   * Exporta lista leve de pacientes.
   * attendance[] e evolutions[] não existem aqui — usa total_attendance e total_evolutions (contagens do backend).
   */
  exportPatientsToExcel(patients: Patient[], userName: string, userRole: string): void {
    if (!patients?.length) { console.warn('Nenhum paciente para exportar'); return; }

    const data: any[][] = [
      ['STUDIO PILATES - RELATÓRIO COMPLETO'],
      [`Usuário: ${userName} (${userRole === 'gestor' ? 'Gestor' : 'Profissional'})`],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
      [],
      ['Nome', 'Profissional', 'Dias', 'Total Aulas', 'Total Evoluções', 'Pacote', 'Líquido']
    ];

    patients.forEach(p => {
      data.push([
        this.truncate(p.nome),
        this.truncate(this.professionalsMap()[p.profissional_id]),
        p.dias.map(d => d.toUpperCase()).join(', '),
        p.total_attendance ?? '-',
        p.total_evolutions ?? '-',
        `R$ ${p.valor.toFixed(2)}`,
        `R$ ${p.ganho.toFixed(2)}`
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 25 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Alunos');
    this.writeFileAsync(wb, `pilates-${new Date().toISOString().split('T')[0]}.xlsx`);
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