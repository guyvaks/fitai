export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        background: "#0F172A",
        surface: "#1E293B",
        "text-main": "#F8FAFC",
        "text-muted": "#94A3B8",
      },
      fontFamily: {
        heebo: ["Heebo", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        elem: "8px",
      },
    },
  },
  plugins: [],
};
