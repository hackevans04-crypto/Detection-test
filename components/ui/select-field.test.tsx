// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelectField } from '@/components/ui/fields'

/**
 * El desplegable dejó de ser un `<select>` nativo para poder vestirlo como el
 * resto del producto. Al hacerlo se hereda la responsabilidad del teclado, que
 * antes ponía el navegador: esto fija ese contrato.
 */

const options = ['Masculino', 'Femenino', 'Prefiere no decirlo']

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <SelectField label="Sexo" value={value} onChange={setValue} options={options} placeholder="Sin especificar" />
      <output data-testid="valor">{value || '(vacío)'}</output>
    </>
  )
}

const combo = () => screen.getByRole('combobox', { name: /Sexo/ })
const chosen = () => screen.getByTestId('valor').textContent

beforeAll(() => {
  // jsdom no implementa el desplazamiento; el efecto que centra la opción
  // activa lo llama en cada movimiento.
  Element.prototype.scrollIntoView = () => {}
})

afterEach(cleanup)

describe('desplegable propio', () => {
  it('no deja un select nativo en el árbol', () => {
    const { container } = render(<Harness />)
    expect(container.querySelector('select')).toBeNull()
    expect(combo()).toHaveProperty('tagName', 'BUTTON')
  })

  it('abre con el ratón y muestra las opciones más el vacío', () => {
    render(<Harness />)
    fireEvent.click(combo())
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getAllByRole('option')).toHaveLength(options.length + 1)
  })

  it('abre con flecha abajo y elige con Enter', () => {
    render(<Harness />)
    fireEvent.keyDown(combo(), { key: 'ArrowDown' })
    fireEvent.keyDown(combo(), { key: 'ArrowDown' })
    fireEvent.keyDown(combo(), { key: 'Enter' })
    expect(chosen()).toBe('Masculino')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Escape cierra sin cambiar el valor', () => {
    render(<Harness initial="Femenino" />)
    fireEvent.click(combo())
    fireEvent.keyDown(combo(), { key: 'ArrowDown' })
    fireEvent.keyDown(combo(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(chosen()).toBe('Femenino')
  })

  it('busca por letras con la lista cerrada', () => {
    render(<Harness />)
    fireEvent.keyDown(combo(), { key: 'p' })
    expect(chosen()).toBe('Prefiere no decirlo')
  })

  it('la primera opción devuelve el campo a vacío', () => {
    render(<Harness initial="Masculino" />)
    fireEvent.click(combo())
    fireEvent.click(screen.getByRole('option', { name: 'Sin especificar' }))
    expect(chosen()).toBe('(vacío)')
  })

  it('anuncia la opción activa y la seleccionada', () => {
    render(<Harness initial="Femenino" />)
    fireEvent.click(combo())
    expect(combo().getAttribute('aria-expanded')).toBe('true')
    expect(combo().getAttribute('aria-activedescendant')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Femenino/ }).getAttribute('aria-selected')).toBe('true')
  })
})
