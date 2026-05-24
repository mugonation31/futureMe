import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SupabaseService } from '../../core/services/supabase.service';
import { User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navigation.component.html',
  styleUrl: './navigation.component.scss'
})
export class NavigationComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  // Store current user info
  currentUser: User | null = null;
  userName: string = '';
  menuOpen = false;

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu() {
    this.menuOpen = false;
  }

  ngOnInit() {
    // Subscribe to user changes (login/logout events)
    this.supabaseService.currentUser$.subscribe(user => {
      this.currentUser = user;
      // Get user's name from metadata or email
      this.userName = user?.user_metadata?.['name'] || user?.email?.split('@')[0] || 'User';
    });

    // Close menu on route navigation
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.menuOpen = false;
    });
  }

  /**
   * Logout the current user
   */
  async logout() {
    try {
      await this.supabaseService.signOut();
      this.router.navigate(['/login']);
    } catch (error) {
      if (!environment.production) {
        console.error('Error logging out:', error);
      }
    }
  }
}
