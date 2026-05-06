import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, FlatList, ScrollView, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import ChatScreen from './components/ChatScreen';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [targetServerUrl, setTargetServerUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('READY FOR SYNC');
  const [remoteFiles, setRemoteFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('sync'); // 'sync' or 'chat'

  useEffect(() => {
    let interval;
    if (targetServerUrl) {
      fetchFiles();
      interval = setInterval(fetchFiles, 5000);
    }
    return () => clearInterval(interval);
  }, [targetServerUrl]);

  const fetchFiles = async () => {
    try {
      const response = await fetch(`${targetServerUrl}pc-files`);
      const data = await response.json();
      setRemoteFiles(data);
    } catch (error) {
      console.log('Poll error:', error);
    }
  };

  const handleConnect = (url) => {
    if (!url) return;
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) cleanUrl = 'http://' + cleanUrl;
    if (!cleanUrl.endsWith('/')) cleanUrl += '/';
    setTargetServerUrl(cleanUrl);
    setStatus('SYNCED TO PC');
  };

  const pickAndUpload = async () => {
    if (!targetServerUrl) return Alert.alert('Error', 'Connect to a server first');
    
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true });
      if (result.canceled) return;

      setIsUploading(true);
      setStatus('UPLOADING...');

      for (const asset of result.assets) {
        const formData = new FormData();
        // @ts-ignore
        formData.append('file', {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
        });
        formData.append('device-name', 'Mobile-Expo');

        await fetch(`${targetServerUrl}upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
            'device-name': 'Mobile-Expo',
          },
        });
      }

      setStatus('SYNC COMPLETED!');
      setTimeout(() => {
        setStatus('SYNCED TO PC');
        setIsUploading(false);
      }, 2000);
    } catch (error) {
      Alert.alert('Upload Failed', error.message);
      setIsUploading(false);
      setStatus('SYNCED TO PC');
    }
  };

  const onBarcodeScanned = ({ data }) => {
    setIsScanning(false);
    handleConnect(data);
  };

  if (isScanning) {
    if (!permission?.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.text}>Camera permission required</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.button}>
                    <Text style={styles.buttonText}>GRANT PERMISSION</Text>
                </TouchableOpacity>
            </View>
        );
    }
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={onBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        />
        <View style={styles.overlay}>
            <View style={styles.scannerRect} />
            <TouchableOpacity onPress={() => setIsScanning(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>CANCEL SCAN</Text>
            </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#050505', '#111']} style={styles.container}>
      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sync' && styles.activeTab]}
          onPress={() => setActiveTab('sync')}
        >
          <Text style={[styles.tabText, activeTab === 'sync' && styles.activeTabText]}>📤 SYNC</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>💬 CHAT</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Tab */}
      {activeTab === 'sync' ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>DROP</Text>
            <Text style={styles.subtitle}>Instant Mobile Sync</Text>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.card}>
          {!targetServerUrl ? (
            <View style={styles.setupView}>
              <Text style={styles.label}>CONNECT TO PC SERVER</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 192.168.1.5:5000"
                placeholderTextColor="#444"
                value={inputUrl}
                onChangeText={setInputUrl}
              />
              <TouchableOpacity style={styles.connectBtn} onPress={() => handleConnect(inputUrl)}>
                <Text style={styles.btnText}>CONNECT NOW</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.scanBtn} onPress={() => setIsScanning(true)}>
                <Text style={styles.btnText}>📸 SCAN QR CODE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.activeView}>
              <View style={styles.dropZone}>
                <View style={styles.iconCircle}>
                  <Text style={styles.icon}>🚀</Text>
                </View>
                <Text style={styles.label}>CONNECTED TO PC</Text>
                <TouchableOpacity style={styles.actionBtn} onPress={pickAndUpload} disabled={isUploading}>
                  <Text style={styles.btnText}>{isUploading ? 'UPLOADING...' : 'SELECT & UPLOAD'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.status}>{status}</Text>

              {remoteFiles.length > 0 && (
                <View style={styles.fileSection}>
                    <Text style={styles.sectionTitle}>FILES FROM PC</Text>
                    {remoteFiles.map((file, index) => (
                        <View key={index} style={styles.fileItem}>
                            <View>
                                <Text style={styles.fileName}>{file.name}</Text>
                                <Text style={styles.fileSize}>{file.size}</Text>
                            </View>
                            <Text style={styles.dlIcon}>📥</Text>
                        </View>
                    ))}
                </View>
              )}

              <TouchableOpacity style={styles.disconnectBtn} onPress={() => setTargetServerUrl('')}>
                <Text style={styles.disconnectText}>DISCONNECT</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
        </>
      ) : (
        /* Chat Tab */
        <ChatScreen serverUrl={targetServerUrl || 'http://localhost:5000'} />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  tabBar: { 
    flexDirection: 'row', 
    backgroundColor: 'rgba(15, 15, 15, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 247, 255, 0.2)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#00f7ff',
  },
  tabText: {
    color: '#a0a0a0',
    fontWeight: '600',
    fontSize: 12,
  },
  activeTabText: {
    color: '#00f7ff',
  },
  cameraContainer: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  scannerRect: { width: 250, height: 250, borderWidth: 2, borderColor: '#00f7ff', borderRadius: 12 },
  cancelButton: { marginTop: 40, padding: 15, backgroundColor: '#ff00ff', borderRadius: 10 },
  cancelText: { color: '#fff', fontWeight: 'bold' },
  scrollContent: { padding: 20 },
  header: { padding: 40, alignItems: 'center', marginTop: 40 },
  title: { fontSize: 42, color: '#00f7ff', fontWeight: '900', letterSpacing: -2, textShadowColor: '#00f7ff', textShadowOffset: {width: 0, height: 0}, textShadowRadius: 10 },
  subtitle: { color: '#fff', fontSize: 16, opacity: 0.8 },
  card: { backgroundColor: 'rgba(15, 15, 15, 0.8)', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(0, 247, 255, 0.2)' },
  setupView: { width: '100%' },
  label: { color: '#00f7ff', fontSize: 12, fontWeight: 'bold', marginBottom: 10 },
  input: { backgroundColor: '#111', borderRadius: 12, padding: 15, color: '#fff', marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  connectBtn: { backgroundColor: '#00f7ff', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  scanBtn: { backgroundColor: 'transparent', padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ff00ff' },
  activeView: { width: '100%', alignItems: 'center' },
  dropZone: { alignItems: 'center', padding: 20, width: '100%' },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0, 247, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  icon: { fontSize: 32 },
  actionBtn: { backgroundColor: '#00f7ff', padding: 15, borderRadius: 12, alignItems: 'center', width: '100' },
  btnText: { fontWeight: 'bold', color: '#000' },
  status: { color: '#00f7ff', marginTop: 20, fontWeight: 'bold' },
  fileSection: { width: '100%', marginTop: 30 },
  sectionTitle: { color: '#ff00ff', fontSize: 14, fontWeight: 'bold', marginBottom: 15 },
  fileItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 12, marginBottom: 10 },
  fileName: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  fileSize: { color: '#888', fontSize: 12 },
  dlIcon: { fontSize: 20 },
  disconnectBtn: { marginTop: 30 },
  disconnectText: { color: '#444', fontWeight: 'bold' },
  text: { color: '#fff', marginBottom: 20 },
  button: { backgroundColor: '#00f7ff', padding: 15, borderRadius: 12 },
  buttonText: { fontWeight: 'bold' }
});
