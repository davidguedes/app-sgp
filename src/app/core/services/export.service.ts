import { inject, Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { Patient } from '../models/patient.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  authService = inject(AuthService);
  professionalsMap = this.authService.professionalsMap;

  // Limite de caracteres por célula do Excel
  private readonly MAX_CELL_LENGTH = 32000;

  /**
   * Trunca texto para evitar corrupção de células no Excel
   */
  private truncate(value: unknown, max = this.MAX_CELL_LENGTH): string {
    if (value === null || value === undefined) return '-';
    const str = String(value);
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  /**
   * Sanitiza o nome da aba do Excel:
   * - Remove caracteres inválidos: / \ ? * [ ]
   * - Limita a 31 caracteres (limite do Excel)
   */
  private sanitizeSheetName(name: string): string {
    return name
      .replace(/[\/\\?\*\[\]:]/g, '')
      .substring(0, 31)
      .trim() || 'Sheet';
  }

  /**
   * Executa a geração e download do arquivo de forma assíncrona
   * para não bloquear a thread principal
   */
  private writeFileAsync(wb: XLSX.WorkBook, fileName: string): void {
    setTimeout(() => {
      XLSX.writeFile(wb, fileName, { compression: true });
    }, 0);
  }

  /**
   * Exporta lista de pacientes para Excel
   */
  exportPatientsToExcel(patients: Patient[], userName: string, userRole: string): void {
    if (!patients || patients.length === 0) {
      console.warn('Nenhum paciente para exportar');
      return;
    }

    const data: any[][] = [
      ['STUDIO PILATES - RELATÓRIO COMPLETO'],
      [`Usuário: ${userName} (${userRole === 'gestor' ? 'Gestor' : 'Profissional'})`],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
      [],
      ['Nome', 'Profissional', 'Dias', 'Presenças', 'Faltas', 'Taxa %', 'Evoluções', 'Pacote', 'Líquido']
    ];

    patients.forEach(patient => {
      const attendance = patient.attendance || [];
      const presencas = attendance.filter(a => a.status === 'present').length;
      const faltas = attendance.filter(a => a.status === 'absent').length;
      const total = presencas + faltas;
      const taxaPresenca = total > 0 ? ((presencas / total) * 100).toFixed(1) : '0';
      const evolucoes = (patient.evolutions || []).length;

      data.push([
        this.truncate(patient.nome),
        this.truncate(this.professionalsMap()[patient.profissional_id]),
        patient.dias.map(d => d.toUpperCase()).join(', '),
        presencas,
        faltas,
        `${taxaPresenca}%`,
        evolucoes,
        `R$ ${patient.valor.toFixed(2)}`,
        `R$ ${patient.ganho.toFixed(2)}`
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!cols'] = [
      { wch: 25 },
      { wch: 22 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Alunos');

    const fileName = `pilates-${new Date().toISOString().split('T')[0]}.xlsx`;
    this.writeFileAsync(wb, fileName);
  }

  /**
   * Exporta detalhes de um paciente específico
   */
  exportPatientDetail(patient: Patient): void {
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

    if (patient.attendance && patient.attendance.length > 0) {
      patient.attendance
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .forEach(att => {
          const statusLabel =
            att.status === 'present' ? 'Presente' :
            att.status === 'absent'  ? 'Faltou'   : 'Reposição';

          data.push([
            new Date(att.date).toLocaleDateString('pt-BR'),
            statusLabel,
            this.truncate(att.notes || '-')
          ]);
        });
    } else {
      data.push(['Nenhum registro de frequência']);
    }

    data.push([]);
    data.push(['EVOLUÇÕES']);
    data.push(['Data', 'Eva', 'Exercícios', 'Notas', 'Autor']);

    if (patient.evolutions && patient.evolutions.length > 0) {
      patient.evolutions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .forEach(evo => {
          data.push([
            new Date(evo.date).toLocaleDateString('pt-BR'),
            this.truncate(evo.eva),
            this.truncate(evo.exercises),   // campo mais propenso a texto longo
            this.truncate(evo.notes),
            this.truncate(evo.author)
          ]);
        });
    } else {
      data.push(['Nenhuma evolução registrada']);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!cols'] = [
      { wch: 20 },
      { wch: 30 },
      { wch: 50 },
      { wch: 50 },
      { wch: 20 }
    ];

    // Nome da aba sanitizado para evitar caracteres inválidos e estouro de 31 chars
    const sheetName = this.sanitizeSheetName(patient.nome);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const safeName = patient.nome.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
    const fileName = `${safeName}-${new Date().toISOString().split('T')[0]}.xlsx`;
    this.writeFileAsync(wb, fileName);
  }

  /**
   * Exporta relatório de frequência consolidado
   */
  exportAttendanceReport(patients: Patient[], startDate: Date, endDate: Date): void {
    const data: any[][] = [
      ['RELATÓRIO DE FREQUÊNCIA'],
      [`Período: ${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
      [],
      ['Aluno', 'Total Aulas', 'Presenças', 'Faltas', 'Reposições', 'Taxa Presença']
    ];

    patients.forEach(patient => {
      const attendance = patient.attendance.filter(att => {
        const attDate = new Date(att.date);
        return attDate >= startDate && attDate <= endDate;
      });

      const presencas = attendance.filter(a => a.status === 'present').length;
      const faltas = attendance.filter(a => a.status === 'absent').length;
      const reposicoes = attendance.filter(a => a.status === 'makeup').length;
      const total = presencas + faltas;
      const taxa = total > 0 ? ((presencas / total) * 100).toFixed(1) : '0';

      data.push([
        this.truncate(patient.nome),
        total,
        presencas,
        faltas,
        reposicoes,
        `${taxa}%`
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!cols'] = [
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Frequência');

    const fileName = `frequencia-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.xlsx`;
    this.writeFileAsync(wb, fileName);
  }
}