import { useState } from "react";
import useFilterStore from "../stores/useFilterStore";
import { useShallow } from "zustand/react/shallow";
import { ChevronRight, Filter, X, ChevronsLeft } from "lucide-react";

const FilterSidebar = ({ isDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    regionState,
    ageState,
    genderState,
    updateFilter,
    clearSection,
    displayByState,
  } = useFilterStore(
    useShallow((state) => ({
      regionState: state.regionState,
      ageState: state.ageState,
      genderState: state.genderState,
      updateFilter: state.updateFilter,
      clearSection: state.clearSection,
      displayByState: state.displayByState,
    }))
  );

  // Define explicit colors based on dark mode
  const colors = {
    background: isDarkMode ? "#1F2937" : "white",
    headerBg: isDarkMode ? "#111827" : "#f9fafb",
    text: isDarkMode ? "#F3F4F6" : "#111827",
    mutedText: isDarkMode ? "#9CA3AF" : "#6B7280",
    border: isDarkMode ? "#374151" : "#E5E7EB",
    buttonBg: isDarkMode ? "#2563EB" : "#3B82F6",
    buttonHoverBg: isDarkMode ? "#1D4ED8" : "#2563EB",
    buttonText: isDarkMode ? "white" : "white",
    badgeBg: isDarkMode ? "#4B5563" : "#E5E7EB",
    badgeText: isDarkMode ? "#F3F4F6" : "#374151",
  };

  // Count active filters
  const getActiveFilterCount = () => {
    const countChecked = (arr) => arr.filter((item) => item.checked).length;
    return (
      countChecked(regionState) +
      countChecked(ageState) +
      countChecked(genderState) +
      countChecked(displayByState)
    );
  };

  const activeFilterCount = getActiveFilterCount();

  const handleChange = (section, id, checked) => {
    console.log("Filter Change:", { section, id, checked });
    updateFilter(section, id, checked);
  };

  const renderSection = (title, state, section) => {
    const activeCount = state.filter((item) => item.checked).length;

    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium" style={{ color: colors.text }}>
            {title}
            {activeCount > 0 && (
              <span
                className="ml-2 px-2 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: colors.badgeBg,
                  color: colors.badgeText,
                }}
              >
                {activeCount}
              </span>
            )}
          </h3>
          <button
            onClick={() => clearSection(section)}
            className="text-xs hover:underline"
            style={{ color: isDarkMode ? "#60A5FA" : "#2563EB" }}
          >
            Clear all
          </button>
        </div>
        <div
          className="pl-2 space-y-2 max-h-48 overflow-y-auto pr-1"
          style={{
            borderLeft: `2px solid ${isDarkMode ? "#374151" : "#E5E7EB"}`,
          }}
        >
          {state.map((option) => (
            <div key={option.id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`${section}-${option.id}`}
                checked={option.checked}
                onChange={(e) =>
                  handleChange(section, option.id, e.target.checked)
                }
                className="rounded"
                style={{
                  accentColor: isDarkMode ? "#3B82F6" : "#2563EB",
                }}
              />
              <label
                htmlFor={`${section}-${option.id}`}
                className="text-sm"
                style={{ color: colors.text }}
              >
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Calculate header height - this may need adjustment based on your actual header height
  const headerHeight = 60; // adjust to match your header height in pixels

  return (
    <>
      {/* Floating trigger button when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed left-0 top-1/2 transform -translate-y-1/2 z-40 shadow-lg h-12 flex items-center"
          style={{
            backgroundColor: colors.buttonBg,
            color: colors.buttonText,
            borderTopRightRadius: "0.5rem",
            borderBottomRightRadius: "0.5rem",
            borderTopLeftRadius: "0",
            borderBottomLeftRadius: "0",
            padding: "0.25rem 0.5rem",
          }}
          aria-label="Open filters"
        >
          <ChevronRight size={20} />
          <Filter size={16} className="ml-1" />
          {activeFilterCount > 0 && (
            <span
              className="absolute -top-2 -right-2 px-1.5 py-0.5 text-xs rounded-full"
              style={{
                backgroundColor: colors.badgeBg,
                color: colors.badgeText,
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      )}

      {/* Overlay that only appears when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => setIsOpen(false)}
        ></div>
      )}

      {/* Side panel with explicit styling - positioned below header */}
      <div
        className="fixed left-0 z-40 transition-transform duration-300 ease-in-out transform shadow-xl"
        style={{
          width: "260px",
          backgroundColor: colors.background,
          borderRight: `1px solid ${colors.border}`,
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          top: `${headerHeight}px`, // Position below header
          height: `calc(100% - ${headerHeight}px)`, // Adjust height to account for header
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{
            backgroundColor: colors.headerBg,
            borderColor: colors.border,
          }}
        >
          <div className="flex items-center gap-2">
            <Filter size={18} style={{ color: colors.text }} />
            <span className="font-medium" style={{ color: colors.text }}>
              Filters
            </span>
            {activeFilterCount > 0 && (
              <span
                className="px-2 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: colors.badgeBg,
                  color: colors.badgeText,
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-full hover:bg-opacity-80"
            style={{
              backgroundColor: isDarkMode ? "#374151" : "#E5E7EB",
              color: colors.text,
            }}
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Sections */}
        <div
          className="overflow-y-auto px-4 py-2"
          style={{ height: "calc(100% - 140px)" }}
        >
          {renderSection("Display By", displayByState, "displayBy")}
          <div
            className="my-2 h-px w-full"
            style={{ backgroundColor: colors.border }}
          ></div>
          {renderSection("Region", regionState, "region")}
          <div
            className="my-2 h-px w-full"
            style={{ backgroundColor: colors.border }}
          ></div>
          {renderSection("Age Percentage", ageState, "age")}
          <div
            className="my-2 h-px w-full"
            style={{ backgroundColor: colors.border }}
          ></div>
          {renderSection("Gender", genderState, "gender")}
        </div>

        {/* Footer with clear button */}
        {activeFilterCount > 0 && (
          <div
            className="border-t p-4 absolute bottom-0 w-full"
            style={{ borderColor: colors.border }}
          >
            <button
              className="w-full py-2 px-4 rounded flex items-center justify-center"
              style={{
                border: `1px solid ${colors.border}`,
                color: colors.text,
                backgroundColor: isDarkMode ? "#111827" : "#F9FAFB",
              }}
              onClick={() => {
                clearSection("displayBy");
                clearSection("region");
                clearSection("age");
                clearSection("gender");
              }}
            >
              <X size={14} className="mr-2" />
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default FilterSidebar;
