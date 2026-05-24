import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the current year dynamically', () => {
    // Arrange
    const expectedYear = new Date().getFullYear().toString();

    // Act
    const copyEl = fixture.nativeElement.querySelector('.footer-copy');

    // Assert: template uses {{ currentYear }} binding, not a hard-coded literal
    expect(copyEl.textContent).toContain(expectedYear);
    // Verify the component property drives the template
    expect(component.currentYear.toString()).toBe(expectedYear);
  });
});
