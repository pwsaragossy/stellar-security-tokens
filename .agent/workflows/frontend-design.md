---
description: Create distinctive, production-grade frontend interfaces with exceptional design quality (ported from Claude Code plugin)
---

# Frontend Design Skill

This workflow guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## When To Use

Invoke this workflow with `/frontend-design` when:
- Building new web components, pages, or applications
- Redesigning existing UI to be more visually striking
- Creating landing pages, dashboards, or user interfaces
- Wanting to avoid generic AI-generated aesthetics

## Design Thinking Process

Before writing any code, understand the context and commit to a **BOLD** aesthetic direction:

### 1. Understand Purpose
- What problem does this interface solve?
- Who uses it?
- What is the context (fintech, creative, enterprise, consumer)?

### 2. Choose Aesthetic Tone
Pick a distinctive direction - avoid generic. Consider:
- **Brutally Minimal**: Stark, purposeful emptiness
- **Maximalist Chaos**: Dense, layered, overwhelming in a good way
- **Retro-Futuristic**: Y2K, vaporwave, CRT aesthetics
- **Organic/Natural**: Flowing shapes, earthy tones, biomorphic forms
- **Luxury/Refined**: Gold accents, serif fonts, high-end magazine feel
- **Playful/Toy-like**: Bold colors, rounded shapes, joyful
- **Editorial/Magazine**: Grid-based, strong typography, art-directed
- **Brutalist/Raw**: Exposed structure, bold contrasts, anti-design
- **Art Deco/Geometric**: Ornate patterns, 1920s elegance
- **Soft/Pastel**: Gentle gradients, muted colors, calm
- **Industrial/Utilitarian**: Function-first, exposed mechanics

### 3. Define The Unforgettable Element
What's the ONE thing someone will remember about this interface?

---

## Frontend Aesthetics Guidelines

### Typography
- **NEVER** use generic fonts: Inter, Roboto, Arial, system fonts
- Choose fonts that are beautiful, unique, characterful
- Pair a distinctive display font with a refined body font
- Consider: Syne, DM Sans, Space Grotesk, Outfit, Playfair Display, Instrument Sans, Cabinet Grotesk, Clash Display
- Use Google Fonts or similar for easy implementation

### Color & Theme
- Commit to a cohesive palette - use CSS custom properties
- Dominant colors with sharp accents > timid, evenly-distributed palettes
- **AVOID**: Purple gradients on white (overused AI aesthetic)
- Vary between light and dark themes across designs
- Consider: mesh gradients, duotones, monochromatic with one pop color

### Motion & Animation
- Prioritize CSS-only solutions for simple effects
- Use Framer Motion for React when available
- Focus on high-impact moments:
  - Page load with staggered reveals (`animation-delay`)
  - Scroll-triggered animations
  - Hover states that surprise
- One well-orchestrated entrance > scattered micro-interactions

### Spatial Composition
- Embrace unexpected layouts
- Try: Asymmetry, overlap, diagonal flow, grid-breaking elements
- Use generous negative space OR controlled density (pick one, commit)
- Avoid predictable component patterns

### Backgrounds & Visual Details
Create atmosphere, never default to solid colors:
- Gradient meshes
- Noise/grain textures
- Geometric patterns
- Layered transparencies
- Dramatic shadows
- Decorative borders
- Custom cursors

---

## Anti-Patterns (NEVER DO)

1. **Generic Font Stacks**: Inter, Roboto, Arial, system-ui
2. **Cliché Colors**: Purple-to-pink gradients on white backgrounds
3. **Predictable Layouts**: Card grids with uniform spacing
4. **Cookie-Cutter Components**: Bootstrap-style buttons and forms
5. **Lack of Personality**: No distinctive character for the context
6. **Same Design Every Time**: Each design should be unique

---

## Implementation Notes

1. Match implementation complexity to aesthetic vision:
   - Maximalist designs → elaborate code, extensive animations
   - Minimalist designs → restraint, precision, perfect spacing

2. Use CSS custom properties for consistency:
   ```css
   :root {
     --primary: #FF6B35;
     --accent: #FFD23F;
     --dark: #1A1A2E;
     --light: #F8F9FA;
   }
   ```

3. Always include:
   - Responsive design considerations
   - Accessibility basics (contrast, focus states)
   - Performance (prefer CSS animations over JS)
   - Proper semantic HTML

---

## Proven Templates

When building admin or queue-based UIs, check these tested templates first:

| Template | Workflow | Use When |
|----------|----------|----------|
| Approval Hub | `/approval-hub-template` | Master-detail split pane, filter chips, queue list, action footer, dialogs |

---

## Example Prompt

> "Create a dashboard for viewing security token investments"

**Design Thinking Response:**
- **Purpose**: Fintech investors viewing their portfolio
- **Tone**: Luxury/Refined + Editorial - conveys trust and sophistication
- **Unforgettable**: Elegant data visualization with smooth micro-animations
- **Fonts**: Outfit (headings) + DM Sans (body)
- **Colors**: Deep navy (#0A1628) + Gold accent (#C9A962) + Soft whites
- **Motion**: Staggered card reveals, subtle number counting animations

---

**Remember**: You are capable of extraordinary creative work. Don't hold back - show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
