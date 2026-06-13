import React from 'react';

const Sidebar = ({ isOpen, onClose, savedFiles, onSelect, onDelete }) => {
  return (
    <div className={`sidebar-left ${isOpen ? 'active' : ''}`}>
      <div className="sidebar-header">
        <h3>Saved Files</h3>
        <button className="close-sidebar" onClick={onClose} aria-label="Close Sidebar">&times;</button>
      </div>
      <div id="saved-list">
        {Object.keys(savedFiles).map((name) => (
          <div key={name} className="sidebar-item">
            <span onClick={() => onSelect(name)}>{name}</span>
            <button className="delete-btn" onClick={() => onDelete(name)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
