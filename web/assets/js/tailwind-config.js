// Satu tailwind.config untuk seluruh app (design.md 2.3). Muat SETELAH <script src="https://cdn.tailwindcss.com">.
tailwind.config = {
  theme: { extend: {
    colors: {
      cream:'#F6F0E7', paper:'#FBF8F3', sand:'#EBE0D3', mocha:'#A98B7C', marsala:'#7B4A4A', olive:'#6B6A47', ink:'#2B211C',
      success:'#4E6E58', warning:'#B8863A', error:'#9E3D3D', info:'#4F6B7D'
    },
    fontFamily: { serif:['"Cormorant Garamond"','Georgia','serif'], sans:['Jost','system-ui','sans-serif'] },
    boxShadow: {
      'warm-sm':'0 2px 8px rgba(43,33,28,.04)','warm-md':'0 8px 24px rgba(43,33,28,.06)',
      'warm-lg':'0 16px 36px rgba(43,33,28,.08)', focus:'0 0 0 3px rgba(123,74,74,.18)'
    }
  } }
};
