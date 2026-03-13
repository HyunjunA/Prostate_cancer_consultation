export class jsPDF {
  addImage = jest.fn();
  save = jest.fn();
  setFontSize = jest.fn();
  text = jest.fn();
  addPage = jest.fn();
  internal = {
    pageSize: {
      getWidth: jest.fn().mockReturnValue(210),
      getHeight: jest.fn().mockReturnValue(297),
    },
  };
}

export default jsPDF;
