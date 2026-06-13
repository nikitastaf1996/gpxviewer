import React from 'react';

const Sidebar = ({ active, savedFiles, onSelectFile, onDeleteFile, onClose }) => {
    return (
        <div id="sidebar" className={`sidebar-left ${active ? 'active' : ''}`}>
            <div className="sidebar-header">
                <h3>Saved Files</h3>
                <button className="close-sidebar" onClick={onClose} aria-label="Close Sidebar">&times;</button>
            </div>
            <div id="saved-list">
                {Object.keys(savedFiles).map(name => (
                    <div key={name} className="sidebar-item">
                        <span onClick={() => onSelectFile(name)}>{name}</span>
                        <button
                            className="delete-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteFile(name);
                            }}
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Sidebar;
