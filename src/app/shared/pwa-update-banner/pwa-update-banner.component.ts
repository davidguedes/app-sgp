// src/app/shared/components/pwa-update-banner/pwa-update-banner.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { PwaUpdateService } from '../../core/services/pwa-update.service';

@Component({
  selector: 'app-pwa-update-banner',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './pwa-update-banner.component.html',
  styleUrls: ['./pwa-update-banner.component.scss']
})
export class PwaUpdateBannerComponent {
  pwaUpdate = inject(PwaUpdateService);
}