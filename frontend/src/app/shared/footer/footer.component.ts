import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <footer class="app-footer">
      <div class="footer-content">
        <span class="footer-brand">futureMe</span>
        <span class="footer-copy">© {{ currentYear }} futureMe</span>
      </div>
    </footer>
  `,
  styles: [`
    .app-footer {
      background: var(--bg-surface);
      border-top: 1px solid var(--border);
      padding: var(--space-md) var(--space-lg);
    }

    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-sm);
    }

    .footer-brand {
      font-weight: 600;
      color: var(--text-primary);
    }

    .footer-copy {
      font-size: 0.8125rem;
      color: var(--text-muted);
    }

    @media (max-width: 480px) {
      .footer-content {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-xs);
      }
    }
  `]
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
}
