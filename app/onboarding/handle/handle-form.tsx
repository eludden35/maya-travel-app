"use client";

import { useEffect, useRef, useTransition } from "react";

/**
 * Thin client shell for the onboarding form.
 *
 * Owns:
 *  - the pending state (disable inputs / change CTA copy while the Server
 *    Action runs),
 *  - the live preview that mirrors the handle input into the big Fraunces
 *    "@" display above the form (no React state needed — direct DOM write
 *    keeps the keystroke loop snappy and avoids re-rendering the page).
 *
 * Validation messaging is server-driven (the Server Action returns enum
 * codes via `?error=`); this component just renders the message we were
 * handed and associates it with the right field via `aria-describedby`.
 */
export function HandleForm({
  action,
  defaultDisplayName,
  error,
  errorField,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultDisplayName: string;
  error: string | null;
  errorField: "handle" | "display_name" | null;
}) {
  const [pending, startTransition] = useTransition();
  const handleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = handleInputRef.current;
    if (!input) return;
    const preview = document.querySelector<HTMLElement>("[data-handle-preview]");
    if (!preview) return;

    const update = () => {
      const value = input.value.trim().toLowerCase();
      preview.textContent = value.length > 0 ? value : "your_handle";
    };
    input.addEventListener("input", update);
    return () => input.removeEventListener("input", update);
  }, []);

  return (
    <form
      action={(formData) => startTransition(() => action(formData))}
      className="flex flex-col gap-5"
      noValidate
    >
      <label className="flex flex-col gap-1" htmlFor="handle">
        <span className="text-sm text-secondary">Handle</span>
        <div className="flex items-stretch rounded-md border border-hairline bg-card focus-within:outline-2 focus-within:outline-ember">
          <span
            aria-hidden="true"
            className="flex items-center pl-3 pr-1 text-secondary font-mono"
          >
            @
          </span>
          <input
            id="handle"
            ref={handleInputRef}
            name="handle"
            type="text"
            inputMode="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9_]{3,30}"
            disabled={pending}
            aria-invalid={errorField === "handle" || undefined}
            aria-describedby={
              errorField === "handle" ? "handle-error" : "handle-hint"
            }
            className="flex-1 h-12 pr-3 bg-transparent text-ink font-mono outline-none"
          />
        </div>
        <span id="handle-hint" className="text-xs text-muted">
          3–30 characters. Lowercase letters, numbers, underscores.
        </span>
        {errorField === "handle" && error ? (
          <span id="handle-error" role="alert" className="text-sm text-error">
            {error}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1" htmlFor="display_name">
        <span className="text-sm text-secondary">Display name</span>
        <input
          id="display_name"
          name="display_name"
          type="text"
          autoComplete="name"
          enterKeyHint="done"
          required
          minLength={1}
          maxLength={50}
          defaultValue={defaultDisplayName}
          disabled={pending}
          aria-invalid={errorField === "display_name" || undefined}
          aria-describedby={
            errorField === "display_name" ? "display-name-error" : undefined
          }
          className="h-12 px-3 rounded-md border border-hairline bg-card text-ink focus-visible:outline-2 focus-visible:outline-ember"
        />
        {errorField === "display_name" && error ? (
          <span
            id="display-name-error"
            role="alert"
            className="text-sm text-error"
          >
            {error}
          </span>
        ) : null}
      </label>

      {error && !errorField ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-md bg-ember text-ink font-medium disabled:opacity-60"
      >
        {pending ? "Mailing it..." : "Mail it"}
      </button>
    </form>
  );
}
