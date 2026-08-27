---
name: add-ui
description: Add or update a shadcn/ui component in this repo. Use whenever a UI primitive (dialog, dropdown, input, table, sheet, form, etc.) is needed and it does not already exist in src/components/ui/. Encodes this project's base-vega / Base UI setup so components are not hand-written or pulled from Radix-based examples.
---

# Adding a shadcn/ui component

## Before anything else

Check whether the component already exists:

```bash
ls src/components/ui/
```

If it is there, edit it in place — do not re-run the generator, which would
overwrite local changes.

## Adding it

Use the CLI. Do not hand-write the component and do not paste a snippet from a blog
or from the shadcn docs' default style — this project uses the `base-vega` style,
whose primitives come from **`@base-ui/react`**, not Radix. Radix-based code will
reference packages that are not installed and props that do not exist here.

```bash
npx shadcn@latest add $ARGUMENTS
```

The generator reads `components.json` and will place files at `src/components/ui/`
using the `@/components/ui` alias, `rsc: true`, `tsx: true`, `baseColor: neutral`,
`cssVariables: true`, and `lucide` for icons. Accept its defaults — they are already
correct for this repo.

If the CLI prompts about overwriting an existing file, stop and ask the user first.

## After adding

1. **Read the generated file** before using it. Base UI component APIs differ from
   Radix — check the actual exported names and props rather than assuming
   `Dialog.Trigger`-style Radix conventions.
2. **New dependencies**: the CLI may install `@base-ui/react` sub-packages. That is
   expected. If it tries to install anything `@radix-ui/*`, something is wrong with
   the resolved style — stop and report it.
3. **Theme tokens**: if the component needs a colour or radius that does not exist,
   add it to the `@theme inline` block and the `:root` / `.dark` variable blocks in
   `src/app/globals.css`. There is no `tailwind.config.ts` in this project and one
   must not be created.
4. **Icons** come from `lucide-react`. Do not add another icon library.
5. **Class merging** uses `cn()` from `@/lib/utils`, and variants use
   `class-variance-authority` — follow the pattern already in
   `src/components/ui/button.tsx`.

## Dark mode caveat

`globals.css` defines `@custom-variant dark (&:is(.dark *))`, but nothing in the app
toggles a `.dark` class yet — there is no theme provider. Generated components will
contain `dark:` utilities that are currently inert. Leave them in place; do not strip
them, and do not claim dark mode works until a provider is wired up.

## Finishing

Report which files were created or changed and let the user check the result in the
browser. Do not run any git commands — the user handles all git in this repo.
