import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/stores/useThemeStore";

const ThemeToggle = () => {
  const { isDarkMode, toggleTheme } = useThemeStore();

  return (
    <button
      id="theme-toggle"
      onClick={toggleTheme}
      className={`p-3 rounded-full transition-colors shadow-lg hover:scale-110 ${
        isDarkMode
          ? "bg-gray-700 text-yellow-300 hover:bg-gray-600"
          : "bg-white text-gray-700 hover:bg-gray-100"
      }`}
    >
      {isDarkMode ? <Moon className="h-6 w-6" /> : <Sun className="h-6 w-6" />}
    </button>
  );
};

export default ThemeToggle;
