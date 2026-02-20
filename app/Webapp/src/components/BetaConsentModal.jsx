"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function BetaConsentModal() {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Check if API key already exists in localStorage on component mount
  useEffect(() => {
    // Use try-catch to handle potential localStorage issues in some browsers
    try {
      const storedApiKey = localStorage.getItem("openai_api_key");
      if (storedApiKey) {
        setApiKey(storedApiKey);
      }

      // Check if user has already consented
      const hasConsented = localStorage.getItem("beta_consent");
      if (hasConsented === "true") {
        setConsentChecked(true);
      }

      // Check if modal should be shown (if both key and consent exist, don't show)
      if (storedApiKey && hasConsented === "true") {
        setIsVisible(false);
      }
    } catch (error) {
      console.error("Error accessing localStorage:", error);
    }
  }, []);

  const handleAccept = () => {
    // if (apiKey && consentChecked) {
    if (consentChecked) {
      try {
        // Save API key to localStorage
        localStorage.setItem("openai_api_key", apiKey);
        // Save consent status
        localStorage.setItem("beta_consent", "true");
        // Hide the modal
        setIsVisible(false);

        console.log("API key saved successfully!");
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
                , work is in progress to improve the tool performance.
              </div>
            </li>

            <li className="flex gap-3 text-slate-700 items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                2
              </span>
              <div>
                This tool is not intended to be used for commercial purposes.
              </div>
            </li>

            <li className="flex gap-3 text-slate-700 items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                3
              </span>
              <div>
                Similar to other artificial intelligence systems, it is
                important to acknowledge the inherent risks associated with
                potential inaccuracies in the model's outputs.
              </div>
            </li>

            <li className="flex gap-3 text-slate-700 items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                4
              </span>
              <div>
                The information you provide through the demo and its
                corresponding output will be gathered, maintained, and analyzed
                for the purpose of training and enhancing our models.
              </div>
            </li>

            <li className="flex gap-3 text-slate-700 items-start">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                5
              </span>
              <div>
                Please enter your OpenAI API key below if you wish to use this
                chat function.
                <Link
                  href="#"
                  className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors ml-1"
                >
                  How to Obtain an OpenAI API Key
                </Link>
                <div className="mt-2 text-slate-600">
                  After generating your key, please ensure you add your credits
                  and check your balance on the following site:
                  <Link
                    href="#"
                    className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors ml-1 inline-flex items-center"
                  >
                    OpenAI Billing Overview
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

          <div className="mb-8">
            <p className="mb-3 text-center text-slate-700 font-medium">
              Enter your OpenAI API Key:
            </p>
            <div className="flex shadow-sm rounded-lg overflow-hidden ring-1 ring-indigo-100 focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
              <Input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="flex-1 border-none bg-white/50 backdrop-blur-sm text-slate-800 focus-visible:ring-0 focus-visible:ring-transparent"
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <Button
                variant="ghost"
                className="rounded-l-none bg-white/30 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 border-none font-medium transition-all duration-200"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? "Hide" : "Show"}
              </Button>
            </div>
          </div>

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
              I have reviewed and consent to the foregoing terms and the
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
