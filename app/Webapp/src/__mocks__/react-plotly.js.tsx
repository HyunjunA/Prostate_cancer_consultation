import React from "react";

const Plot = (props: Record<string, unknown>) => {
  return React.createElement("div", { "data-testid": "mock-plotly" }, "Mock Plot");
};

export default Plot;
