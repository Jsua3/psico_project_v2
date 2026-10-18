import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Texto obligatorio que cuenta solo si trae algo más que espacios: `Validators.required` deja pasar «   » y el servidor lo
 * recorta a vacío (400 «No puede estar vacío»). Devuelve el mismo error `required`, así el campo lo dice con el mismo
 * mensaje que cuando está vacío.
 */
export function requiredText(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim() ? null : { required: true };
}
