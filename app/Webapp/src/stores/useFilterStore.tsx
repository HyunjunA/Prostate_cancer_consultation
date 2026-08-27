import { create } from "zustand";

export interface FilterItem {
  id: string;
  label: string;
  checked: boolean;
}

/** The filter groups the sidebar renders; each maps to `<section>State`. */
export type FilterSection = "region" | "age" | "gender" | "displayBy";
type FilterSectionKey = `${FilterSection}State`;

interface FilterStore extends Record<FilterSectionKey, FilterItem[]> {
  updateFilter: (
    section: FilterSection,
    id: string,
    checked: boolean
  ) => void;
  clearSection: (section: FilterSection) => void;
}

const useFilterStore = create<FilterStore>((set) => ({
  regionState: [
    { id: "all", label: "All States", checked: false },
    { id: "AL", label: "Alabama", checked: false },
    { id: "AK", label: "Alaska", checked: false },
    { id: "AZ", label: "Arizona", checked: false },
    { id: "AR", label: "Arkansas", checked: false },
    { id: "CA", label: "California", checked: true },
    { id: "CO", label: "Colorado", checked: false },
    { id: "CT", label: "Connecticut", checked: false },
    { id: "DE", label: "Delaware", checked: false },
    { id: "FL", label: "Florida", checked: false },
    { id: "GA", label: "Georgia", checked: false },
    { id: "HI", label: "Hawaii", checked: false },
    { id: "ID", label: "Idaho", checked: false },
    { id: "IL", label: "Illinois", checked: false },
    { id: "IN", label: "Indiana", checked: false },
    { id: "IA", label: "Iowa", checked: false },
    { id: "KS", label: "Kansas", checked: false },
    { id: "KY", label: "Kentucky", checked: false },
    { id: "LA", label: "Louisiana", checked: false },
    { id: "ME", label: "Maine", checked: false },
    { id: "MD", label: "Maryland", checked: false },
    { id: "MA", label: "Massachusetts", checked: false },
    { id: "MI", label: "Michigan", checked: false },
    { id: "MN", label: "Minnesota", checked: false },
    { id: "MS", label: "Mississippi", checked: false },
    { id: "MO", label: "Missouri", checked: false },
    { id: "MT", label: "Montana", checked: false },
    { id: "NE", label: "Nebraska", checked: false },
    { id: "NV", label: "Nevada", checked: false },
    { id: "NH", label: "New Hampshire", checked: false },
    { id: "NJ", label: "New Jersey", checked: false },
    { id: "NM", label: "New Mexico", checked: false },
    { id: "NY", label: "New York", checked: false },
    { id: "NC", label: "North Carolina", checked: false },
    { id: "ND", label: "North Dakota", checked: false },
    { id: "OH", label: "Ohio", checked: false },
    { id: "OK", label: "Oklahoma", checked: false },
    { id: "OR", label: "Oregon", checked: false },
    { id: "PA", label: "Pennsylvania", checked: false },
    { id: "RI", label: "Rhode Island", checked: false },
    { id: "SC", label: "South Carolina", checked: false },
    { id: "SD", label: "South Dakota", checked: false },
    { id: "TN", label: "Tennessee", checked: false },
    { id: "TX", label: "Texas", checked: false },
    { id: "UT", label: "Utah", checked: false },
    { id: "VT", label: "Vermont", checked: false },
    { id: "VA", label: "Virginia", checked: false },
    { id: "WA", label: "Washington", checked: false },
    { id: "WV", label: "West Virginia", checked: false },
    { id: "WI", label: "Wisconsin", checked: false },
    { id: "WY", label: "Wyoming", checked: false },
  ],
  ageState: [
    { id: "all-ages", label: "All Ages", checked: false },
    { id: "0-17", label: "0-17", checked: true },
    { id: "18-24", label: "18-24", checked: false },
    { id: "25-34", label: "25-34", checked: false },
    { id: "35-44", label: "35-44", checked: false },
    { id: "45-54", label: "45-54", checked: false },
    { id: "55-64", label: "55-64", checked: false },
    { id: "65-74", label: "65-74", checked: false },
    { id: "75-84", label: "75-84", checked: false },
    { id: "85+", label: "85+", checked: false },
  ],
  genderState: [
    { id: "all", label: "All Genders", checked: false },
    { id: "male", label: "Male", checked: true },
    { id: "female", label: "Female", checked: false },
  ],
  displayByState: [
    { id: "cumulativerate", label: "Cumulative Rate", checked: false },
    { id: "weeklyrate", label: "Weekly Rate", checked: true },
  ],

  // updateFilter: (section, id, checked) =>
  //   set((state) => {
  //     const sectionKey = `${section}State`;
  //     const newState = state[sectionKey].map((item) => {
  //       if (item.id === id) return { ...item, checked };
  //       if (id === "all" || item.id === "all") {
  //         return { ...item, checked: id === "all" ? checked : false };
  //       }
  //       return item;
  //     });
  //     console.log("Updated Filter State:", {
  //       section,
  //       selectedId: id,
  //       checked,
  //       newSectionState: newState,
  //     });
  //     return { [sectionKey]: newState };
  //   }),

  updateFilter: (section, id, checked) =>
    set((state) => {
      const sectionKey: FilterSectionKey = `${section}State`;

      // Special handling for displayByState
      if (section === "displayBy") {
        return {
          [sectionKey]: state[sectionKey].map((item) => ({
            ...item,
            checked: item.id === id, // Only the selected item will be checked
          })),
        };
      }

      // Original logic for other sections
      const newState = state[sectionKey].map((item) => {
        if (item.id === id) return { ...item, checked };
        if (id === "all" || item.id === "all") {
          return { ...item, checked: id === "all" ? checked : false };
        }
        return item;
      });

      console.log("Updated Filter State:", {
        section,
        selectedId: id,
        checked,
        newSectionState: newState,
      });

      return { [sectionKey]: newState };
    }),
  clearSection: (section) =>
    set((state) => {
      const sectionKey: FilterSectionKey = `${section}State`;
      return {
        [sectionKey]: state[sectionKey].map((item) => ({
          ...item,
          checked: false,
        })),
      };
    }),
}));

export default useFilterStore;
