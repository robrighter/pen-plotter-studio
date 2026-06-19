// Tiny DOM helpers for building the labelled inputs in the sidebar. Kept
// framework-free on purpose so the app has no UI dependencies.

export interface NumberControlOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

/** A labelled slider paired with an editable number box; the two stay in sync. */
export function numberControl(o: NumberControlOpts): HTMLElement {
  const field = document.createElement("label");
  field.className = "field";

  const span = document.createElement("span");
  const labelText = document.createElement("span");
  labelText.textContent = o.label;
  const valueText = document.createElement("strong");
  valueText.className = "field-value";
  valueText.textContent = String(o.value);
  span.appendChild(labelText);
  span.appendChild(valueText);
  field.appendChild(span);

  const row = document.createElement("div");
  row.className = "range-row";

  const range = document.createElement("input");
  range.type = "range";
  range.min = String(o.min);
  range.max = String(o.max);
  range.step = String(o.step);
  range.value = String(o.value);

  const box = document.createElement("input");
  box.type = "number";
  box.className = "value";
  box.min = String(o.min);
  box.max = String(o.max);
  box.step = String(o.step);
  box.value = String(o.value);

  const emit = (v: number, from: HTMLInputElement) => {
    if (Number.isNaN(v)) return;
    if (from !== range) range.value = String(v);
    if (from !== box) box.value = String(v);
    valueText.textContent = String(v);
    o.onChange(v);
  };

  range.addEventListener("input", () => emit(parseFloat(range.value), range));
  box.addEventListener("input", () => emit(parseFloat(box.value), box));
  box.addEventListener("change", () => emit(parseFloat(box.value), box));

  row.appendChild(range);
  row.appendChild(box);
  field.appendChild(row);
  return field;
}

export interface TextControlOpts {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export function textControl(o: TextControlOpts): HTMLElement {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.textContent = o.label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = o.value;
  input.addEventListener("change", () => o.onChange(input.value));
  field.appendChild(span);
  field.appendChild(input);
  return field;
}

export interface ColorControlOpts {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export function colorControl(o: ColorControlOpts): HTMLElement {
  const field = document.createElement("label");
  field.className = "field color-field";
  const span = document.createElement("span");
  span.textContent = o.label;
  const input = document.createElement("input");
  input.type = "color";
  input.value = o.value;
  input.addEventListener("input", () => o.onChange(input.value));
  field.appendChild(span);
  field.appendChild(input);
  return field;
}

export interface CheckControlOpts {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function checkControl(o: CheckControlOpts): HTMLElement {
  const label = document.createElement("label");
  label.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = o.value;
  input.addEventListener("change", () => o.onChange(input.checked));
  const span = document.createElement("span");
  span.textContent = o.label;
  label.appendChild(input);
  label.appendChild(span);
  return label;
}
