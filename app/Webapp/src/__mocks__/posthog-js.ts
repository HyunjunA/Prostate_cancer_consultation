const posthog = {
  init: jest.fn(),
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  opt_in_capturing: jest.fn(),
  opt_out_capturing: jest.fn(),
  has_opted_in_capturing: jest.fn().mockReturnValue(false),
  has_opted_out_capturing: jest.fn().mockReturnValue(false),
  get_distinct_id: jest.fn().mockReturnValue("test-id"),
  register: jest.fn(),
  people: {
    set: jest.fn(),
  },
};

export default posthog;
