import React, { useState } from 'react';
import { SymbolItem } from '../../../shared/types';

interface SymbolTreeProps {
    symbols: SymbolItem[];
    onJump: (symbol: SymbolItem) => void;
    onSelect: (symbol: SymbolItem) => void;
    selectedSymbol: SymbolItem | null;
    defaultExpanded?: boolean;
    searchQuery?: string;
}

const SymbolNode: React.FC<{ 
    symbol: SymbolItem; 
    depth: number; 
    onJump: (s: SymbolItem) => void;
    onSelect: (s: SymbolItem) => void;
    selectedSymbol: SymbolItem | null;
    defaultExpanded?: boolean;
    searchQuery?: string;
}> = ({ symbol, depth, onJump, onSelect, selectedSymbol, defaultExpanded, searchQuery }) => {
    const [expanded, setExpanded] = useState(() => {
        if (symbol.autoExpand !== undefined) {
            return symbol.autoExpand;
        }
        return defaultExpanded || false;
    });
    const hasChildren = symbol.children && symbol.children.length > 0;

    // Update expanded state when defaultExpanded prop changes or when autoExpand is set by search filter
    React.useEffect(() => {
        if (symbol.autoExpand !== undefined) {
            setExpanded(symbol.autoExpand);
        } else {
            setExpanded(defaultExpanded || false);
        }
    }, [defaultExpanded, symbol.autoExpand]);

    const handleClick = () => {
        onSelect(symbol);
    };

    const handleDoubleClick = () => {
        onJump(symbol);
    };

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };

    // Highlight matched text in bold
    const highlightText = (text: string, query?: string) => {
        if (!query || query.trim() === '') {
            return <>{text}</>;
        }

        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);
        const lowerText = text.toLowerCase();
        
        // Find all match positions
        const matches: Array<{start: number, end: number}> = [];
        keywords.forEach(keyword => {
            let index = 0;
            while ((index = lowerText.indexOf(keyword, index)) !== -1) {
                matches.push({ start: index, end: index + keyword.length });
                index += keyword.length;
            }
        });

        if (matches.length === 0) {
            return <>{text}</>;
        }

        // Sort and merge overlapping matches
        matches.sort((a, b) => a.start - b.start);
        const merged: Array<{start: number, end: number}> = [];
        let current = matches[0];
        
        for (let i = 1; i < matches.length; i++) {
            if (matches[i].start <= current.end) {
                current.end = Math.max(current.end, matches[i].end);
            } else {
                merged.push(current);
                current = matches[i];
            }
        }
        merged.push(current);

        // Build the highlighted text
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;

        merged.forEach((match, idx) => {
            // Add text before match
            if (match.start > lastIndex) {
                parts.push(text.substring(lastIndex, match.start));
            }
            // Add matched text in bold
            parts.push(
                <strong key={`match-${idx}`}>
                    {text.substring(match.start, match.end)}
                </strong>
            );
            lastIndex = match.end;
        });

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return <>{parts}</>;
    };

    // Map SymbolKind to Codicon class and color
    const getIconInfo = (kind: number) => {
        // See vscode.SymbolKind (0-based)
        const map: {[key: number]: { icon: string, colorVar: string }} = {
            0: { icon: 'codicon-symbol-file', colorVar: '--vscode-symbolIcon-fileForeground' },
            1: { icon: 'codicon-symbol-module', colorVar: '--vscode-symbolIcon-moduleForeground' },
            2: { icon: 'codicon-symbol-namespace', colorVar: '--vscode-symbolIcon-namespaceForeground' },
            3: { icon: 'codicon-symbol-package', colorVar: '--vscode-symbolIcon-packageForeground' },
            4: { icon: 'codicon-symbol-class', colorVar: '--vscode-symbolIcon-classForeground' },
            5: { icon: 'codicon-symbol-method', colorVar: '--vscode-symbolIcon-methodForeground' },
            6: { icon: 'codicon-symbol-property', colorVar: '--vscode-symbolIcon-propertyForeground' },
            7: { icon: 'codicon-symbol-field', colorVar: '--vscode-symbolIcon-fieldForeground' },
            8: { icon: 'codicon-symbol-constructor', colorVar: '--vscode-symbolIcon-constructorForeground' },
            9: { icon: 'codicon-symbol-enum', colorVar: '--vscode-symbolIcon-enumForeground' },
            10: { icon: 'codicon-symbol-interface', colorVar: '--vscode-symbolIcon-interfaceForeground' },
            11: { icon: 'codicon-symbol-function', colorVar: '--vscode-symbolIcon-functionForeground' },
            12: { icon: 'codicon-symbol-variable', colorVar: '--vscode-symbolIcon-variableForeground' },
            13: { icon: 'codicon-symbol-constant', colorVar: '--vscode-symbolIcon-constantForeground' },
            14: { icon: 'codicon-symbol-string', colorVar: '--vscode-symbolIcon-stringForeground' },
            15: { icon: 'codicon-symbol-number', colorVar: '--vscode-symbolIcon-numberForeground' },
            16: { icon: 'codicon-symbol-boolean', colorVar: '--vscode-symbolIcon-booleanForeground' },
            17: { icon: 'codicon-symbol-array', colorVar: '--vscode-symbolIcon-arrayForeground' },
            18: { icon: 'codicon-symbol-object', colorVar: '--vscode-symbolIcon-objectForeground' },
            19: { icon: 'codicon-symbol-key', colorVar: '--vscode-symbolIcon-keyForeground' },
            20: { icon: 'codicon-symbol-null', colorVar: '--vscode-symbolIcon-nullForeground' },
            21: { icon: 'codicon-symbol-enum-member', colorVar: '--vscode-symbolIcon-enumMemberForeground' },
            22: { icon: 'codicon-symbol-struct', colorVar: '--vscode-symbolIcon-structForeground' },
            23: { icon: 'codicon-symbol-event', colorVar: '--vscode-symbolIcon-eventForeground' },
            24: { icon: 'codicon-symbol-operator', colorVar: '--vscode-symbolIcon-operatorForeground' },
            25: { icon: 'codicon-symbol-type-parameter', colorVar: '--vscode-symbolIcon-typeParameterForeground' },
        };
        return map[kind] || { icon: 'codicon-symbol-misc', colorVar: '--vscode-symbolIcon-nullForeground' };
    };

    const iconInfo = getIconInfo(symbol.kind);

    return (
        <div>
            <div 
                className={`symbol-item ${selectedSymbol === symbol ? 'selected' : ''}`}
                style={{ 
                    paddingLeft: `${depth * 15 + 5}px`,
                    backgroundColor: symbol.isDeepSearch ? 'var(--vscode-editor-findMatchHighlightBackground)' : undefined
                }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                title={symbol.isDeepSearch ? "Result from Deep Search" : undefined}
            >
                <span 
                    className={`codicon symbol-expand-icon ${hasChildren ? (expanded ? 'codicon-chevron-down' : 'codicon-chevron-right') : 'hidden'}`}
                    onClick={toggleExpand}
                ></span>
                <span 
                    className={`symbol-icon codicon ${iconInfo.icon}`}
                    style={{ color: `var(${iconInfo.colorVar})` }}
                ></span>
                <span className="symbol-name">{highlightText(symbol.name, searchQuery)}</span>
                <span className="symbol-detail">{symbol.detail}</span>
            </div>
            {hasChildren && expanded && (
                <div>
                    {symbol.children.map((child, index) => (
                        <SymbolNode 
                            key={index} 
                            symbol={child} 
                            depth={depth + 1} 
                            onJump={onJump}
                            onSelect={onSelect}
                            selectedSymbol={selectedSymbol}
                            // Fix: Do NOT pass defaultExpanded to children. 
                            // This ensures that if a Struct matches, it expands to show itself, 
                            // but its children (members) remain collapsed by default.
                            defaultExpanded={false}
                            searchQuery={searchQuery}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const SymbolTree: React.FC<SymbolTreeProps> = ({ symbols, onJump, onSelect, selectedSymbol, defaultExpanded, searchQuery }) => {
    return (
        <div className="symbol-tree">
            {symbols.map((symbol, index) => (
                <SymbolNode 
                    key={`${symbol.name}-${index}`} 
                    symbol={symbol} 
                    depth={0} 
                    onJump={onJump}
                    onSelect={onSelect}
                    selectedSymbol={selectedSymbol}
                    defaultExpanded={defaultExpanded}
                    searchQuery={searchQuery}
                />
            ))}
        </div>
    );
};

export default SymbolTree;
