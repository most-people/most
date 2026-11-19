import { SvgXml } from 'react-native-svg'

export type AvatarSvgProps = { xml: string; size: number }

export function AvatarSvg({ xml, size }: AvatarSvgProps) {
  return <SvgXml xml={xml} width={size} height={size} />
}
