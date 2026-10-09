# Dream AI app icon

Created with the built-in imagegen tool (no API key required), matching the onboarding's lilac 3D illustration style.

## Production assets

- `icon.png`: 1024 × 1024 opaque PNG for iOS and the Android legacy launcher.
- `adaptive-icon.png`: 1024 × 1024 transparent moon-and-star foreground for Android adaptive icons.
- Android adaptive background: `#7862D9`.
- `favicon.png`: 48 × 48 opaque PNG for Expo web.
- `preview.png`: 256 × 256 visual preview.
- `icon-source.png`: original generated artwork.
- `adaptive-icon-source.png`: final generated transparent foreground before export resizing.

The app configuration references these files in `app.json`. The existing local iOS asset catalog and Android launcher resources were regenerated using the installed Expo icon helpers. Rebuild the native app to see its launcher icon change; reloading JavaScript cannot replace an installed native launcher icon.

The iOS icon fills the square canvas without transparency or baked-in rounded corners. Android uses a separate transparent foreground with padding for launcher masks. Sizes follow [Expo's app icon guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

## Generation prompt

Style reference: `../onboarding/dream-moon.png`.

```text
Use case: stylized-concept.
Asset type: production mobile app icon for Dream AI, an Expo React Native dream journal.
Create a crisp, memorable premium 3D app icon that visually belongs to the supplied Dream AI onboarding illustration. The reference is a STYLE reference only; simplify it dramatically for icon legibility.
Subject: a single thick sculptural warm-ivory and pale-lavender crescent moon, open to the right, with one small luminous four-point ivory star nestled in its opening. No cloud, orbit rings, extra planets or tiny decorative dots. The moon and star form a compact, distinctive centered silhouette.
Style: polished soft 3D clay, satin pearlescent surfaces, rounded edges, subtle lavender shading and studio highlights; refined and restrained. Strong silhouette readable at 32 pixels.
Background: completely opaque, full-bleed rich lilac/periwinkle background, gently gradient from #9380ED upper left to #6650C5 lower right. Soft subtle studio shadow behind moon. No image transparency.
Composition: exact square 1024x1024 artwork, fill the entire canvas, no pre-rounded app-icon corners or outer frame. Subject centered and contained within the central 60 percent of the canvas width/height, ample even padding safe for circular and squircle system masks.
Constraints: no text, initials, letters, Expo logo, other logos, UI, watermark, borders, phone mockup, or off-canvas objects. One final icon, not a grid of variants.
```

## Android foreground extraction prompt

Reference: the generated opaque icon.

```text
Use case: background-extraction.
Asset type: Android adaptive launcher icon foreground for this exact Dream AI app icon.
Edit the provided icon by removing ONLY the purple background and the diffuse shadow cast on that background. Keep the crescent moon and the one four-point star exactly as shown: identical shapes, materials, pearl colors, lighting, texture, relative positions, camera angle and proportions.
Deliver the complete moon-and-star cluster isolated on a truly transparent square background. Fit the cluster inside the central 60% of canvas width and height by a small uniform reduction only if needed; center it precisely with ample padding for adaptive circular and squircle masks. Do not enlarge the moon or star. No new objects, cloud, rings, text, logo, border, baked-in mask or background. Crisp clean transparent edges.
```

## Android edge cleanup and safe-area prompt

Reference: the generated transparent foreground.

```text
undefined
```

Imagegen created the artwork and transparent foreground. macOS `sips` only normalized export dimensions; Expo's icon helpers generated the native density variants.
