/* Embedded into one offline HTML. No key, source labels, network or storage. */
const envelope = JSON.parse(document.getElementById('study').textContent)
const study = envelope.study
let index = 0
const answers = new Map()
const form = document.getElementById('form')
const status = document.getElementById('status')
const h = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node }

function render() {
  const page = study.pages[index]
  document.getElementById('progress').textContent = `${index + 1} / ${study.pages.length} · ${answers.size} yanıt kaydedildi`
  document.getElementById('brief').textContent = page.brief
  form.replaceChildren()
  const saved = answers.get(page.id)
  const columns = h('div', '')
  columns.className = 'columns'
  for (const side of ['left', 'right']) {
    const field = h('fieldset', '')
    field.append(h('legend', side === 'left' ? 'A listesi' : 'B listesi'))
    for (const name of page[side]) {
      const label = h('label', '')
      const box = document.createElement('input')
      box.type = 'checkbox'; box.name = side; box.value = name; box.checked = saved?.[side]?.includes(name) ?? false
      label.append(box, h('span', name)); field.append(label)
    }
    const noneLabel = h('label', '')
    const none = document.createElement('input')
    none.type = 'checkbox'; none.name = `${side}-none`; none.checked = Boolean(saved && saved[side].length === 0)
    noneLabel.append(none, h('span', 'Bu listeden hiçbirini kullanmam')); field.append(noneLabel)
    field.addEventListener('change', (event) => {
      if (event.target === none && none.checked) field.querySelectorAll(`input[name="${side}"]`).forEach((box) => { box.checked = false })
      else if (event.target !== none && event.target.checked) none.checked = false
    })
    columns.append(field)
  }
  form.append(columns)
  const preference = h('fieldset', '')
  preference.append(h('legend', 'Hangi listeyi tercih ediyorsun?'))
  for (const [value, title] of [['left', 'A listesi'], ['right', 'B listesi'], ['neither', 'İkisi de değil']]) {
    const label = h('label', '')
    const radio = document.createElement('input')
    radio.type = 'radio'; radio.name = 'preference'; radio.value = value; radio.checked = saved?.preference === value
    label.append(radio, h('span', title)); preference.append(label)
  }
  form.append(preference)
  document.getElementById('previous').disabled = index === 0
  document.getElementById('next').textContent = index === study.pages.length - 1 ? 'Yanıtı kaydet ve bitir' : 'Kaydet ve devam et'
  status.textContent = ''
}
function save() {
  const page = study.pages[index]
  const preference = form.querySelector('input[name="preference"]:checked')?.value
  const answer = { id: page.id, preference }
  for (const side of ['left', 'right']) {
    answer[side] = [...form.querySelectorAll(`input[name="${side}"]:checked`)].map((input) => input.value)
    if (!answer[side].length && !form.querySelector(`input[name="${side}-none"]`).checked) {
      status.textContent = 'Her liste için kullanabileceğin isimleri veya hiçbirini kullanmayacağını belirt.'; return false
    }
  }
  if (!preference) { status.textContent = 'Tercihini veya “İkisi de değil” seçeneğini belirt.'; return false }
  answers.set(page.id, answer)
  return true
}
document.getElementById('next').onclick = () => {
  if (!save()) return
  if (index < study.pages.length - 1) { index++; render() }
  else { document.getElementById('progress').textContent = `16 / 16 · ${answers.size} yanıt kaydedildi`; status.textContent = 'Tamamlandı. Yanıtları indir ve değerlendirmeyi yapan kişiye ilet.' }
}
document.getElementById('previous').onclick = () => { if (index > 0) { index--; render() } }
document.getElementById('export').onclick = () => {
  const content = { schema: 'shared-pool-choices-v1', studySha256: envelope.studySha256, answers: [...answers.values()] }
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = 'shared-pool-choices.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
document.getElementById('resume').onchange = async (event) => {
  try {
    const input = JSON.parse(await event.target.files[0].text())
    if (input.schema !== 'shared-pool-choices-v1' || input.studySha256 !== envelope.studySha256 || !Array.isArray(input.answers)) throw Error('Bu dosya bu çalışmaya ait değil.')
    const seen = new Set()
    for (const answer of input.answers) {
      const page = study.pages.find((p) => p.id === answer.id)
      if (!page || seen.has(answer.id) || !['left', 'right', 'neither'].includes(answer.preference)) throw Error('Geçersiz yanıt.')
      seen.add(answer.id)
      for (const side of ['left', 'right']) if (!Array.isArray(answer[side]) || new Set(answer[side]).size !== answer[side].length || !answer[side].every((name) => page[side].includes(name))) throw Error('Geçersiz isim seçimi.')
    }
    answers.clear(); input.answers.forEach((answer) => answers.set(answer.id, answer))
    const next = study.pages.findIndex((p) => !answers.has(p.id)); index = next < 0 ? 0 : next; render()
  } catch (error) { status.textContent = error.message }
}
render()
