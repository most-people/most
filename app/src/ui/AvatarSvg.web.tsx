import { Image, StyleSheet } from 'react-native'
import type { AvatarSvgProps } from './AvatarSvg'

export function AvatarSvg({ xml, size }: AvatarSvgProps) {
  return (
    <Image
      source={{
        uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`,
        width: size,
        height: size,
      }}
      style={styles.image}
    />
  )
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
})
