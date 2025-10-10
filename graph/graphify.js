const chart = require('chart.js');

function createScatterGraph(ctxId, datasets, options = {}) {
  const ctx = document.getElementById(ctxId);

  // default chart options
  const defaultOptions = {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: options.title || 'Scatter Graph'
        },
        legend: {
          display: options.showLegend ?? true
        }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: { display: true, text: options.xLabel || 'X Axis' }
        },
        y: {
          title: { display: true, text: options.yLabel || 'Y Axis' }
        }
      }
    }
  };

  // return the Chart instance (useful for updating later)
  return new Chart(ctx, defaultOptions);
}

// Example usage:
// const myData = [
//   {
//     label: 'Group A',
//     data: [
//       { x: 1, y: 2 },
//       { x: 2, y: 3 },
//       { x: 3, y: 5 },
//       { x: 4, y: 4 }
//     ],
//     backgroundColor: 'rgba(255, 99, 132, 0.8)',
//     pointRadius: 6
//   },
//   {
//     label: 'Group B',
//     data: [
//       { x: 1, y: 3 },
//       { x: 2, y: 2 },
//       { x: 3, y: 4 },
//       { x: 4, y: 6 }
//     ],
//     backgroundColor: 'rgba(54, 162, 235, 0.8)',
//     pointRadius: 6
//   }
// ];
// const chart = createScatterGraph('scatterChart', myData, {
//   title: 'My Scatter Chart Example',
//   xLabel: 'Time (s)',
//   yLabel: 'Value'
// });