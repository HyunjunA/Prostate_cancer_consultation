const Plotly = {
  newPlot: jest.fn(),
  react: jest.fn(),
  purge: jest.fn(),
  relayout: jest.fn(),
  restyle: jest.fn(),
  update: jest.fn(),
  addTraces: jest.fn(),
  deleteTraces: jest.fn(),
  Plots: {
    resize: jest.fn(),
  },
};

export default Plotly;
