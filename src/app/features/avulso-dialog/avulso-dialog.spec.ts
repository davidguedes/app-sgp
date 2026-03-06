import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AvulsoDialog } from './avulso-dialog';

describe('AvulsoDialog', () => {
  let component: AvulsoDialog;
  let fixture: ComponentFixture<AvulsoDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvulsoDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AvulsoDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
