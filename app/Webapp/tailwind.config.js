/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // For src directory usage
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class", // Dark mode configuration
  theme: {
    extend: {
      // Custom colors for dark/light modes
      colors: {
        // Light mode colors
        light: {
          background: "#ffffff",
          text: "#000000",
          primary: "#4ecdc4",
          secondary: "#ff6b6b",
        },
        // Dark mode colors
        dark: {
          background: "#1a1a1a",
          text: "#ffffff",
          primary: "#2d9d96",
          secondary: "#e65555",
        },
      },
      keyframes: {
        "glow-dark": {
          "0%, 100%": { backgroundColor: "#ffffff05" },
          "50%": { backgroundColor: "#ffffff20" },
        },
        "glow-light": {
          "0%, 100%": { backgroundColor: "#00000005" },
          "50%": { backgroundColor: "#00000020" },
        },
      },
      animation: {
        "glow-dark": "glow-dark 1.5s ease-in-out infinite",
        "glow-light": "glow-light 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
