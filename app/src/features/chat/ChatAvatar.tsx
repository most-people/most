import { useMemo, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { Avatar, Style } from '@dicebear/core'
import planetsDefinition from '@dicebear/styles/planets.json'

type ChatAvatarProps = { address: string; avatar?: string }

export function ChatAvatar({ address, avatar }: ChatAvatarProps) {
  const [failedUri, setFailedUri] = useState('')
  const fallback = useMemo(
    () =>
      new Avatar(new Style(planetsDefinition), {
        seed: 'most.box@' + address,
      }).toString(),
    [address]
  )
  return (
    <View style={styles.avatar}>
      {avatar && avatar !== failedUri ? (
        <Image
          source={{ uri: avatar }}
          style={styles.image}
          onError={() => setFailedUri(avatar)}
        />
      ) : (
        <SvgXml xml={fallback} width={40} height={40} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 5,
    overflow: 'hidden',
    flexShrink: 0,
  },
  image: { width: 40, height: 40 },
})
