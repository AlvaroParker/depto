---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. In existing products, preserve and extend the established visual language, component patterns, spacing, and tokens instead of introducing an unrelated style. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI).
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

In an existing application, consistency is a hard requirement. Extend the product's current design system and visual language rather than replacing it with a disconnected new aesthetic. Innovation should happen inside the established patterns unless the user explicitly asks for a redesign.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and choose the right level of design change:

- **Existing product first**: Inspect the current UI patterns before designing. Reuse the established structure, spacing rhythm, typography scale, border radius, elevation, interaction patterns, and color tokens.
- **Greenfield vs existing**: If the task is a new standalone artifact, choose a bold aesthetic direction. If the task is within an existing app, keep the app recognizable and improve quality through refinement, composition, hierarchy, and polish.
- **Innovation boundary**: Be ambitious in craftsmanship, layout, and details, but do not introduce a visual language that clashes with adjacent screens or shared components.

Then commit to a clear aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: For greenfield work, pick a strong aesthetic point of view. For existing products, derive the tone from what is already on screen and push it toward a more refined, more coherent, more premium version of itself.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. In existing products, the direction should feel like a natural evolution of the current system, not a style reset. Bold maximalism and refined minimalism both work; the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:

- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail
- Consistent with neighboring screens and shared UI primitives when working inside an existing product

## Frontend Aesthetics Guidelines

Focus on:

- **Typography**: If the product already has typography choices, preserve them and improve hierarchy with scale, weight, rhythm, and contrast. Only introduce new fonts when the task is clearly greenfield or the user asks for a design reset.
- **Color & Theme**: Reuse the existing product palette and shared tokens when they exist. In this repository, prefer the shared Tailwind color tokens over hardcoded colors. Innovate through composition, contrast, layering, and emphasis rather than random palette changes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Improve hierarchy and composition without breaking the product's navigational or component logic. Use asymmetry, overlap, density shifts, or restraint where they fit the surrounding interface.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

- **Design System Respect**: Match existing button styles, input treatments, card patterns, table conventions, states, and responsive behavior before inventing new primitives. Prefer extending the current component vocabulary over creating parallel patterns.

NEVER use generic AI-generated aesthetics like cliched color schemes, predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character. In existing products, also never drop in a beautiful-but-incompatible style that ignores the current UI language.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. For greenfield work, vary between themes, type systems, and aesthetics. For existing products, create distinction through high-quality execution inside the established system instead of constant visual reinvention.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. In existing products, prefer the smallest set of visual changes that materially improves quality while preserving coherence.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
