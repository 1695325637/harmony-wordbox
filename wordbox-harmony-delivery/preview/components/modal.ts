/** Generic modal base — no business logic; three actions / three options bind here. */
export interface ModalAction {
  readonly label: string;
  readonly kind: 'primary' | 'secondary' | 'danger';
  readonly onClick: () => void | Promise<void>;
}

export interface ModalController {
  show(title: string, bodyHtml: string, actions: readonly ModalAction[]): void;
  dismiss(): void;
  isOpen(): boolean;
}

/** Create a modal controller mounted on a persistent host element. */
export function createModal(host: HTMLElement): ModalController {
  let open: boolean = false;

  function dismiss(): void {
    host.innerHTML = '';
    open = false;
  }

  const controller: ModalController = {
    isOpen(): boolean {
      return open;
    },
    dismiss: dismiss,
    show(title: string, bodyHtml: string, actions: readonly ModalAction[]): void {
      host.innerHTML = '';
      const overlay: HTMLDivElement = document.createElement('div');
      overlay.className = 'wb-modal-overlay';
      const card: HTMLDivElement = document.createElement('div');
      card.className = 'wb-modal-card';
      const h: HTMLHeadingElement = document.createElement('h3');
      h.textContent = title;
      const body: HTMLDivElement = document.createElement('div');
      body.className = 'wb-modal-body';
      body.innerHTML = bodyHtml;
      const row: HTMLDivElement = document.createElement('div');
      row.className = 'wb-modal-actions';
      for (const action of actions) {
        const btn: HTMLButtonElement = document.createElement('button');
        btn.className = 'wb-btn wb-btn-' + action.kind;
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          const result: void | Promise<void> = action.onClick();
          dismiss();
          void result;
        });
        row.appendChild(btn);
      }
      card.appendChild(h);
      card.appendChild(body);
      card.appendChild(row);
      overlay.appendChild(card);
      overlay.addEventListener('click', (event: MouseEvent) => {
        if (event.target === overlay) dismiss();
      });
      host.appendChild(overlay);
      open = true;
    },
  };
  return controller;
}
