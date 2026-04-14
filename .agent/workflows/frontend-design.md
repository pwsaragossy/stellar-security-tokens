---
description: Create distinctive, production-grade frontend interfaces with exceptional design quality (updated from anthropics/skills)
---

# Frontend Design Skill

This workflow guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## When To Use

Invoke this workflow with `/frontend-design` when building web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a **BOLD** aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

## Anti-Patterns (NEVER DO)

- NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts).
- NEVER use cliched color schemes (particularly purple gradients on white backgrounds).
- NEVER use predictable layouts and component patterns.
- NEVER use cookie-cutter design that lacks context-specific character.
- NEVER converge on common choices (Space Grotesk, for example) across generations. No design should be the same.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

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
