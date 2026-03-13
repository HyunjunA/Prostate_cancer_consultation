import React from "react";

export const PostHogProvider = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(React.Fragment, null, children);
};

export const usePostHog = () => ({
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
});
