import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <footer class="app-footer">
      <p class="footer-copy">© {{ currentYear }} futureMe</p>
    </footer>
  `,
  styles: [`
    .app-footer {
      border-top: 1px solid var(--border);
      padding: var(--space-md) var(--space-lg);
      text-align: center;
    }

    .footer-copy {
      font-size: 0.8125rem;
      color: var(--text-muted);
      margin: 0;
    }
  `]
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
}
