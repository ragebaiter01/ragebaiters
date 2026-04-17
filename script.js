const memberData = {
  "Yotzek (Ben)": { img: "images/benf.png", role: "Teamführer", desc: "Ben koordiniert die Truppe und bewahrt selbst im Gefecht einen kühlen Kopf." },
  "sneiper0 (Jason)": { img: "images/jason.png", role: "Sniper", desc: "Präzisionsschütze der Ragebaiters." },
  "MundMbrothers (Michael)": { img: "images/michi2.png", role: "Medic", desc: "Sorgt für die Einsatzfähigkeit des Teams." },
  "Disccave (Nils)": { img: "images/nils.png", role: "Breacher / OG", desc: "Einer der OGs. Experte für Improvisation." },
  "Nathan Goldstein (Nathan)": { img: "images/nathan.png", role: "Support", desc: "Gibt Feuerschutz mit hohem Munitionsdurchsatz." },
  "Gemeral Richard (Riccardo)": { img: "images/riccardo.png", role: "Breacher", desc: "Spezialist für CQB." },
  "Wolfgang": { img: "images/wolfgang.png", role: "Techniker", desc: "Hält die Markierer am Laufen." }
};

function openMember(name) {
  const data = memberData[name];
  if (data) {
    document.getElementById('modalName').innerText = name;
    document.getElementById('modalRole').innerText = data.role;
    document.getElementById('modalDesc').innerText = data.desc;
    document.getElementById('modalImg').src = data.img;
    document.getElementById('memberModal').style.display = 'flex';
  }
}

function closeModal() {
  document.getElementById('memberModal').style.display = 'none';
}

window.addEventListener('click', function(e) {
  const modal = document.getElementById('memberModal');
  if (modal && e.target === modal) closeModal();
});
