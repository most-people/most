import ky from 'ky'

export const api = ky.create({
  prefix: '',
  throwHttpErrors: false,
})
