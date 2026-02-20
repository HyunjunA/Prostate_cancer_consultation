"use strict";
exports.__esModule = true;
exports.metadata = void 0;
var local_1 = require("next/font/local");
require("./globals.css");
var PostHogProvider_1 = require("./providers/PostHogProvider");
var geistSans = local_1["default"]({
    src: "./fonts/GeistVF.woff",
    variable: "--font-geist-sans",
    weight: "100 900"
});
var geistMono = local_1["default"]({
    src: "./fonts/GeistMonoVF.woff",
    variable: "--font-geist-mono",
    weight: "100 900"
});
exports.metadata = {
    title: "Prostate Cancer Consultation Dashboard",
    description: ""
};
function RootLayout(_a) {
    var children = _a.children;
    return (React.createElement("html", { lang: "en" },
        React.createElement("body", { className: geistSans.variable + " " + geistMono.variable + " antialiased" },
            React.createElement(PostHogProvider_1.PostHogProvider, null, children))));
}
exports["default"] = RootLayout;
