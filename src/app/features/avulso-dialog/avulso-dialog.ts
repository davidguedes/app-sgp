import { Component, EventEmitter, Input, input, Output, signal } from '@angular/core';
import { Validators, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Attendance, AvulsoFormData } from '../../core/models/attendance.model';
import { Patient } from '../../core/models/patient.model';
import { PatientService } from '../../core/services/patient.service';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-avulso-dialog',
  imports: [CommonModule, ReactiveFormsModule, DialogModule, MultiSelectModule, DatePickerModule, InputNumberModule, ButtonModule],
  templateUrl: './avulso-dialog.html',
  styleUrl: './avulso-dialog.scss',
})
export class AvulsoDialog {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<Attendance[]>();

  patients = input.required<Patient[]>();   // lista de alunos para o multiselect

  form = this.createForm();
  saving = signal(false);

  constructor(
    private fb: FormBuilder,
    private patientService: PatientService,
    private msg: MessageService
  ) {}

  private createForm() {
    return this.fb.group({
      patient_ids: [[] as string[], Validators.required],
      date:        [new Date(), Validators.required],
      valor:       [null as number | null, [Validators.required, Validators.min(0.01)]],
      notes:       ['']
    });
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;

    this.patientService.createAvulso(v as AvulsoFormData).subscribe({
      next: (records) => {
        this.msg.add({ severity: 'success', summary: 'Sucesso',
          detail: `${records.length} aula(s) avulsa(s) registrada(s)` });
        this.saved.emit(records);
        this.visibleChange.emit(false);
        this.saving.set(false);
      },
      error: () => {
        this.msg.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível salvar' });
        this.saving.set(false);
      }
    });
  }
}
