/** @type {import('tailwindcss').Config} */
// Colors resolve to CSS variables (see app/globals.css) so every token follows
// the active theme and still supports Tailwind opacity modifiers (bg-accent/10).
const token = name => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        panel: token("panel"),
        subtle: token("subtle"),
        raised: token("raised"),
        line: token("line"),
        "line-strong": token("line-strong"),
        fg: token("fg"),
        "fg-2": token("fg-2"),
        muted: token("muted"),
        faint: token("faint"),
        accent: token("accent"),
        "accent-text": token("accent-text"),
        "on-accent": token("on-accent"),
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        info: token("info")
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"]
      },
      // A slightly larger scale than Tailwind's default: 13px is the smallest
      // text in the product, 15px is the body size.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.25rem" }],
        sm: ["0.9375rem", { lineHeight: "1.5rem" }],
        base: ["1rem", { lineHeight: "1.625rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.025em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.03em" }],
        "5xl": ["3rem", { lineHeight: "1.05", letterSpacing: "-0.035em" }],
        "6xl": ["3.75rem", { lineHeight: "1", letterSpacing: "-0.04em" }]
      },
      borderRadius: {
        control: "10px",
        card: "16px"
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)"
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" }
        },
        "shine": {
          "0%": { opacity: "0" },
          "30%": { opacity: "0.35" },
          "100%": { opacity: "0" }
        },
        "shimmer": {
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        "fade-in": "fade-in 600ms ease-out both",
        float: "float 6s ease-in-out infinite",
        shine: "shine 2.8s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
