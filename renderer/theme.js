const PET_THEME_ROLES = ["background", "text", "accent", "muted", "border", "surface", "selection", "working", "blocked", "done", "unknown"];

function themeColors(theme) {
  return Object.fromEntries(PET_THEME_ROLES.flatMap((role) => {
    const color = theme?.colors?.[role];
    return typeof color === "string" && /^#[\da-f]{6}$/i.test(color) ? [[role, color]] : [];
  }));
}

function themeContrast(color) {
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
}

function themeVariables(theme) {
  const colors = themeColors(theme);
  const variables = Object.fromEntries(Object.entries(colors).map(([role, color]) => [`--pet-${role}`, color]));
  if (colors.accent) variables["--pet-on-accent"] = themeContrast(colors.accent);
  if (colors.blocked) variables["--pet-on-blocked"] = themeContrast(colors.blocked);
  return variables;
}

const PET_PRESET_THEMES = {
  "catppuccin": {
    "name": "catppuccin",
    "colors": {
      "background": "#181825",
      "text": "#cdd6f4",
      "accent": "#89b4fa",
      "muted": "#a6adc8",
      "border": "#7f849c",
      "surface": "#313244",
      "selection": "#1e1e2e",
      "working": "#f9e2af",
      "blocked": "#f38ba8",
      "done": "#94e2d5",
      "unknown": "#6c7086"
    }
  },
  "catppuccin-latte": {
    "name": "catppuccin-latte",
    "colors": {
      "background": "#eff1f5",
      "text": "#4c4f69",
      "accent": "#1e66f5",
      "muted": "#6c6f85",
      "border": "#8c8fa1",
      "surface": "#ccd0da",
      "selection": "#e6e9ef",
      "working": "#df8e1d",
      "blocked": "#d20f39",
      "done": "#179299",
      "unknown": "#9ca0b0"
    }
  },
  "tokyo-night": {
    "name": "tokyo-night",
    "colors": {
      "background": "#1a1b26",
      "text": "#c0caf5",
      "accent": "#7aa2f7",
      "muted": "#a9b1d6",
      "border": "#697196",
      "surface": "#24283b",
      "selection": "#232636",
      "working": "#e0af68",
      "blocked": "#f7768e",
      "done": "#7dcfff",
      "unknown": "#565f89"
    }
  },
  "tokyo-night-day": {
    "name": "tokyo-night-day",
    "colors": {
      "background": "#e1e2e7",
      "text": "#3760bf",
      "accent": "#2e7de9",
      "muted": "#6172b0",
      "border": "#68709a",
      "surface": "#c4c8da",
      "selection": "#d2d3da",
      "working": "#8c6c3e",
      "blocked": "#f52a65",
      "done": "#118c74",
      "unknown": "#8990b3"
    }
  },
  "gruvbox": {
    "name": "gruvbox",
    "colors": {
      "background": "#282828",
      "text": "#ebdbb2",
      "accent": "#d79921",
      "muted": "#d5c4a1",
      "border": "#a89984",
      "surface": "#3c3836",
      "selection": "#323130",
      "working": "#fabd2f",
      "blocked": "#fb4934",
      "done": "#8ec07c",
      "unknown": "#928374"
    }
  },
  "gruvbox-light": {
    "name": "gruvbox-light",
    "colors": {
      "background": "#fbf1c7",
      "text": "#3c3836",
      "accent": "#076678",
      "muted": "#504945",
      "border": "#7c6f64",
      "surface": "#ebdbb2",
      "selection": "#f2e5bc",
      "working": "#b57614",
      "blocked": "#9d0006",
      "done": "#427b58",
      "unknown": "#928374"
    }
  }
};

function selectedTheme(saved) {
  return saved === "auto" || Object.hasOwn(PET_PRESET_THEMES, saved) ? saved : "auto";
}

function resolveTheme(selection, observed) {
  const base = PET_PRESET_THEMES.catppuccin;
  if (selection !== "auto") return PET_PRESET_THEMES[selection] || base;
  return { name: observed?.name || base.name, colors: { ...base.colors, ...themeColors(observed) } };
}

if (typeof module !== "undefined") module.exports = {
  themeColors, themeVariables, selectedTheme, resolveTheme, PET_PRESET_THEMES,
};
