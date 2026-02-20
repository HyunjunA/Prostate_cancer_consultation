# NUSPAR

> A React-based dashboard for visualizing Flu Vaccine Effectiveness (VE). Inspired by CDC's [FluView](https://gis.cdc.gov/GRASP/Fluview/FluHospRates.html), this project provides weekly visualization of Flu test results and vaccination status.

## Project Overview

### Key Features

- Weekly aggregation and visualization of Flu test results (Positive/Negative)
- Interactive and responsive chart
- Downloadable data report
- ~~Filtering by region, age, gender, and etc~~

<!-- ### Development Goals

1. Basic Dashboard: Visualize weekly Flu test results
2. Implement filtering system
3. Build data integration and management system -->

This project includes various chart components, reusable hooks, and global state management.

## Table of Contents

- [Getting Started](#getting-started)
- [Charts](#charts)
- [Hooks](#hooks)
- [Stores](#stores)
- [License](#license)

## Getting Started

If you do not have node.js installed, you can download it from [here](https://nodejs.org/en/download/)

First, install the dependencies:

```bash
npm install
```

Second, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Charts

### About Charts

The project uses D3.js for custom, advanced visualizations. Each chart component is located in the `/components/charts/d3js` directory.

### Charts

- **LineChart**
- **FluVELineChartV3**
- **FluVELineChartXaxisSelectorV3**
- **BarChart**
- **StackedBarChart**
- **PieChart**
- **DonutChart**
- **Histogram**

## Hooks

### About Hooks

Custom hooks implement reusable logic for API communication, UI state control, and code readability and maintainability.

### Available Custom Hooks

<!-- - **useChartSelection()**
- **useDemographicData()** -->

- **useFluVEData**

## Stores

### About Stores

The project uses Zustand for simple and intuitive global state management.

### Available Stores

- **useCircleIndexStore**
- **useFilterStore**
- **useThemeStore**
- **useWindowSizeStore**
- **useXAxisDragSelectionStoreuseThemeStore**
- **useXAxisSelectionStore**

# Docker Setup for NUSPAR

This document provides instructions on how to set up and run the NUSPAR using Docker and Docker Compose.

## Prerequisites

Ensure you have the following installed on your system before proceeding:

- [Docker](https://www.docker.com/get-started)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Building and Running the Application

Follow these detailed instructions to deploy the Next.js standalone application with an Express server using Docker Compose:

### **1. Run the Docker Container**

Start the container in detached mode (running in the background) by executing:

```sh
docker-compose up -d
```

### **2. Accessing the Application**

The application will now be accessible through your web browser at the following address (assuming port 80 mapping in `docker-compose.yml`):

```sh
http://your_public_ip
```

Replace `your_public_ip` with the actual public IP address or domain associated with your server.

### **3. Stopping the Container**

To gracefully stop the running container, execute:

```sh
docker-compose down
```

## License

~~This project is licensed under the MIT License - see the LICENSE.md file for details.~~

<!-- ## Getting Started

If you do not have node.js installed, you can download it from [here](https://nodejs.org/en/download/)

First, install the dependencies:

```bash
npm install
```

Second, run the development server:

```bash
npm run dev

```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. -->
