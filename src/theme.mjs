// Resolve the same optional design tokens used by other Ink OS applications.
const styles=getComputedStyle(document.documentElement);
export const inkColor=(name,fallback)=>styles.getPropertyValue(name).trim()||fallback;
export const GRID_THEME={
 accentColor:inkColor('--ink-accent','#c7c5be'),accentLight:inkColor('--ink-selection','#ffffff0d'),
 textDark:inkColor('--ink-text','#dededb'),textMedium:inkColor('--ink-secondary','#a0a19b'),textLight:inkColor('--ink-muted','#777a74'),
 textHeader:inkColor('--ink-secondary','#a0a19b'),textHeaderSelected:inkColor('--ink-text','#dededb'),
 bgCell:inkColor('--ink-bg','#1a1a1a'),bgCellMedium:inkColor('--ink-surface','#222222'),bgHeader:inkColor('--ink-raised','#2a2a2a'),
 bgHeaderHovered:inkColor('--ink-surface','#222222'),bgHeaderHasFocus:inkColor('--ink-raised','#2a2a2a'),
 borderColor:inkColor('--ink-line','#dedede14'),horizontalBorderColor:inkColor('--ink-line','#dedede14'),headerBottomBorderColor:inkColor('--ink-line','#dedede14'),
 baseFontStyle:'12px',headerFontStyle:'500 11px',fontFamily:inkColor('--ink-font','InkInter, system-ui, sans-serif'),cellHorizontalPadding:12,cellVerticalPadding:8
};
