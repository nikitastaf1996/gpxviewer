import React from 'react';
import { formatPace } from '../utils/gpxUtils';

const HillMatrix = ({ climbs }) => {
  if (!climbs || climbs.length === 0) return null;

  return (
    <div className="hill-matrix">
      <h4>Hill Consistency Matrix</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
            <th style={{ padding: '4px' }}>#</th>
            <th style={{ padding: '4px' }}>Dist (m)</th>
            <th style={{ padding: '4px' }}>Gain (m)</th>
            <th style={{ padding: '4px' }}>Avg Pace</th>
          </tr>
        </thead>
        <tbody>
          {climbs.map((climb, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px' }}>{i + 1}</td>
              <td style={{ padding: '4px' }}>{Math.round(climb.dist)}</td>
              <td style={{ padding: '4px' }}>{Math.round(climb.gain)}</td>
              <td style={{ padding: '4px' }}>{formatPace(climb.avgPace)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HillMatrix;
