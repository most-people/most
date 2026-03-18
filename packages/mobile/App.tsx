/**
 * Most Box Mobile - App Entry Point
 * React Native application entry
 */

import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Button, TextInput, Alert } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import MostBoxMobile from './bridge';

function App(): React.ReactElement {
  const [nodeId, setNodeId] = useState<string>('');
  const [networkStatus, setNetworkStatus] = useState<string>('等待连接...');
  const [link, setLink] = useState<string>('');
  const [publishedFiles, setPublishedFiles] = useState<any[]>([]);
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    // Start Node.js process
    MostBoxMobile.startNodeProcess();

    // Listen for ready event
    const unsubReady = MostBoxMobile.onReady(() => {
      setIsReady(true);
      initApp();
    });

    // Listen for network status updates
    const unsubNetwork = MostBoxMobile.onNetworkStatus((data: any) => {
      const status = data.peers > 0 ? `已连接 ${data.peers} 个节点` : '等待连接...';
      setNetworkStatus(status);
    });

    return () => {
      unsubReady();
      unsubNetwork();
    };
  }, []);

  const initApp = async () => {
    try {
      const id = await MostBoxMobile.getNodeId();
      setNodeId(id);
      const files = await MostBoxMobile.listPublishedFiles();
      setPublishedFiles(files);
    } catch (err) {
      console.error('初始化失败:', err);
    }
  };

  const selectFile = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });
      if (result && result[0]) {
        const file = result[0];
        Alert.alert('发布文件', `确定要发布 ${file.name} 吗？`, [
          { text: '取消', style: 'cancel' },
          { text: '发布', onPress: () => publishFile(file.uri, file.name) },
        ]);
      }
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('错误', '选择文件失败');
      }
    }
  };

  const publishFile = async (uri: string, name: string) => {
    try {
      Alert.alert('发布中', '正在计算文件哈希并发布...');
      const result = await MostBoxMobile.publishFile(uri, name);
      Alert.alert('发布成功', `链接: ${result.link}`);
      const files = await MostBoxMobile.listPublishedFiles();
      setPublishedFiles(files);
    } catch (err: any) {
      Alert.alert('发布失败', err.message);
    }
  };

  const downloadFile = async () => {
    if (!link) {
      Alert.alert('提示', '请输入 most:// 链接');
      return;
    }
    try {
      Alert.alert('下载中', '正在从 P2P 网络下载...');
      const result = await MostBoxMobile.downloadFile(link);
      Alert.alert('下载成功', `文件已保存到: ${result.savedPath}`);
    } catch (err: any) {
      Alert.alert('下载失败', err.message);
    }
  };

  if (!isReady) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.loading}>正在初始化 P2P 节点...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Most Box</Text>
        <Text style={styles.nodeId}>节点 ID: {nodeId}</Text>
        <Text style={styles.networkStatus}>网络: {networkStatus}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>发布文件</Text>
          <Button title="选择文件" onPress={selectFile} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>已发布文件 ({publishedFiles.length})</Text>
          {publishedFiles.map((file, index) => (
            <View key={index} style={styles.fileItem}>
              <Text style={styles.fileName}>{file.fileName}</Text>
              <Text style={styles.fileLink}>{file.link}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>下载文件</Text>
          <TextInput
            style={styles.input}
            placeholder="输入 most:// 链接"
            value={link}
            onChangeText={setLink}
          />
          <Button title="开始下载" onPress={downloadFile} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    fontSize: 16,
    color: '#666',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  nodeId: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  networkStatus: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  fileItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
  },
  fileLink: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  input: {
    height: 40,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
});

export default App;