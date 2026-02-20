"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function BetaConsentModal() {
  const [consentChecked, setConsentChecked] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Check if user has already consented on component mount
  useEffect(() => {
    try {
      // Check if user has already consented
      const hasConsented = localStorage.getItem("beta_consent");
      if (hasConsented === "true") {
        setConsentChecked(true);
        setIsVisible(false);
      }
    } catch (error) {
      console.error("Error accessing localStorage:", error);
    }
  }, []);

  const handleAccept = () => {
    if (consentChecked) {
      try {
        // Save consent status
        localStorage.setItem("beta_consent", "true");
        // Hide the modal
        setIsVisible(false);
      } catch (error) {
        console.error("Error saving to localStorage:", error);
      }
    }
  };

  // Function to handle checkbox change
  const handleConsentChange = (checked) => {
    setConsentChecked(checked);
  };

  // If modal is not visible, don't render anything
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900/90 to-indigo-900/90 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-all duration-300">
      <Card className="w-full max-w-2xl bg-gradient-to-b from-white to-slate-50 rounded-xl shadow-2xl border border-indigo-100 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-purple-600 via-violet-500 to-indigo-600"></div>
        <CardContent className="p-8 sm:p-10">
          <h2 className="text-2xl font-bold text-center mb-8 text-slate-800 tracking-tight">
            Welcome to the{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-600">
              Beta Experience
            </span>
          </h2>

          <ul className="space-y-5 mb-8">
            <li className="flex gap-3 text-slate-700 items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                1
              </span>
              <div>
                This is a{" "}
                <span className="font-semibold text-indigo-700">
                  beta release
                </span>
                , work is in progress to improve the tool performance and user
                experience.
              </div>
            </li>

            <li className="flex gap-3 text-slate-700 items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                2
              </span>
              <div>
                This tool is designed for personal and educational use, and is
                not intended for commercial purposes at this stage.
              </div>
            </li>

            <li className="flex gap-3 text-slate-700 items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                3
              </span>
              <div>
                The information you provide through this platform and
                corresponding outputs may be collected and analyzed for
                improving our services.
              </div>
            </li>

            <li className="flex gap-3 text-slate-700 items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                4
              </span>
              <div>
                For optimal experience, we recommend using the latest version of
                modern browsers.
                <div className="mt-2 text-slate-600">
                  For additional resources and project documentation, please
                  visit:
                  <Link
                    href="#"
                    className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors ml-1 inline-flex items-center"
                  >
                    Documentation Center
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 ml-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </Link>
                </div>
              </div>
            </li>
          </ul>

          <div className="flex items-center space-x-3 mb-10 justify-center bg-indigo-50/50 p-4 rounded-lg">
            <Checkbox
              id="consent"
              checked={consentChecked}
              onCheckedChange={handleConsentChange}
              className="data-[state=checked]:bg-indigo-600 border-2 border-indigo-300 h-5 w-5"
            />
            <label
              htmlFor="consent"
              className="text-sm text-slate-700 cursor-pointer"
              onClick={() => setConsentChecked(!consentChecked)}
            >
              I have reviewed and consent to the terms and the
              <span className="font-semibold text-indigo-700 ml-1">
                Acceptable Use Policy
              </span>
              .
            </label>
          </div>

          <div className="flex justify-center">
            <Button
              className={`px-10 py-6 rounded-lg font-semibold text-base relative overflow-hidden transition-all duration-300 ${
                consentChecked
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-indigo-200 hover:shadow-xl"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
              disabled={!consentChecked}
              onClick={handleAccept}
            >
              <span className="relative z-10">Accept & Continue</span>
              {consentChecked && (
                <span className="absolute inset-0 bg-gradient-to-r from-purple-700 to-indigo-700 opacity-0 hover:opacity-100 transition-opacity duration-300"></span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
