/**
 * HomeScreen - Library and main navigation hub
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColors, useThemeToggle, Spacing, BorderRadius, Typography } from '../theme';
import { RootStackParamList } from '../types';
import { useLibraryStore, LibraryBook } from '../store/useLibraryStore';
import { bulkImportService, epubCoverExtractor, ImportCandidate } from '../services/library';
import { copyBookToLibrary, getLibraryPath } from '../store/useLibraryStore';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { EmptyState } from '../components/EmptyState';
import { PremiumButton } from '../components/PremiumButton';

type HomeNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

// Book card component
const BookCard: React.FC<{
  book: LibraryBook;
  onPress: () => void;
  onLongPress: () => void;
  colors: any;
}> = ({ book, onPress, onLongPress, colors }) => {
  const progress = book.totalPages > 0
    ? Math.round((book.currentPage / book.totalPages) * 100)
    : 0;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days} jours`;
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <TouchableOpacity
      style={[styles.bookCard, { backgroundColor: book.coverColor || colors.surface }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.bookCover}>
        {book.coverImagePath ? (
          <Image
            source={{ uri: `file://${book.coverImagePath}` }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.bookEmoji}>📚</Text>
        )}
      </View>
      <View style={styles.bookInfo}>
        <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={2}>
          {book.title}
        </Text>
        {book.author && (
          <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
            {book.author}
          </Text>
        )}
        <View style={styles.bookMeta}>
          <Text style={[styles.bookProgress, { color: colors.textMuted }]}>
            {progress}% • Page {book.currentPage}/{book.totalPages}
          </Text>
        </View>
        <Text style={[styles.bookDate, { color: colors.textMuted }]}>
          {formatDate(book.lastReadAt)}
        </Text>
      </View>
      {/* Progress bar */}
      <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%`, backgroundColor: colors.primary },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
};

export const HomeScreen: React.FC = () => {
  const colors = useColors();
  const { isDark } = useThemeToggle();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavigationProp>();
  const { books, removeBook, addBook, updateCover } = useLibraryStore();

  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const handleBookPress = (book: LibraryBook) => {
    navigation.navigate('Reader', { bookId: book.id });
  };

  const handleBookLongPress = (book: LibraryBook) => {
    Alert.alert(
      'Supprimer le livre ?',
      `Voulez-vous supprimer "${book.title}" de votre bibliothèque ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => removeBook(book.id),
        },
      ]
    );
  };

  const hasBooks = books.length > 0;

  const handleScanFolder = async () => {
    setScanModalVisible(true);
    setScanning(true);
    setCandidates([]);
    setSelected(new Set());

    const granted = await bulkImportService.requestStoragePermission();
    if (!granted) {
      setScanning(false);
      Alert.alert('Permission refusée', 'Accès au stockage requis pour scanner les dossiers.');
      setScanModalVisible(false);
      return;
    }

    const found = await bulkImportService.scanAllDefaultDirs();
    const existingPaths = new Set(books.map((b) => b.filePath));
    const fresh = found.filter((c) => !existingPaths.has(c.path));
    setCandidates(fresh);
    setSelected(new Set(fresh.map((c) => c.path)));
    setScanning(false);
  };

  const handleBulkImport = async () => {
    setImporting(true);
    const toImport = candidates.filter((c) => selected.has(c.path));

    for (const candidate of toImport) {
      try {
        const localPath = await copyBookToLibrary(candidate.path, candidate.name);
        const title = candidate.name.replace(/\.(epub|txt)$/i, '');
        const newBook = addBook({
          title,
          author: 'Inconnu',
          filePath: localPath,
          fileName: candidate.name,
          fileType: candidate.type,
          totalPages: 0,
        });
        if (candidate.type === 'epub') {
          epubCoverExtractor.extractCover(localPath, newBook.id, getLibraryPath())
            .then((p) => { if (p) updateCover(newBook.id, p); })
            .catch(() => {});
        }
      } catch {
        // skip on error
      }
    }

    setImporting(false);
    setScanModalVisible(false);
    Alert.alert('Importation terminée', `${toImport.length} livre(s) ajouté(s).`);
  };

  return (
    <ErrorBoundary screenName="HomeScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.primary}
        />

        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
          <View style={styles.headerTop}>
            <Text style={[styles.title, { color: colors.textOnPrimary }]}>
              SensualRead
            </Text>
            <View style={styles.headerRight}>
              <ConnectionStatus />
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => navigation.navigate('Settings')}
              >
                <Text style={styles.settingsIcon}>⚙</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: colors.primaryLight }]}>
            {hasBooks ? `${books.length} livre${books.length > 1 ? 's' : ''}` : 'Your Personal E-Reader'}
          </Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.buttonPrimary }]}
              onPress={() => navigation.navigate('Reader', undefined)}
            >
              <Text style={styles.actionIcon}>➕</Text>
              <Text style={[styles.actionText, { color: colors.textOnPrimary }]}>
                Nouveau livre
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate('DeviceTest')}
            >
              <Text style={styles.actionIcon}>📳</Text>
              <Text style={[styles.actionText, { color: colors.text }]}>
                Connexion
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.surface }]}
              onPress={handleScanFolder}
            >
              <Text style={styles.actionIcon}>🔍</Text>
              <Text style={[styles.actionText, { color: colors.text }]}>Scanner</Text>
            </TouchableOpacity>
          </View>

          {/* Library */}
          {hasBooks ? (
            <View style={styles.library}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Ma bibliothèque
              </Text>
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onPress={() => handleBookPress(book)}
                  onLongPress={() => handleBookLongPress(book)}
                  colors={colors}
                />
              ))}
            </View>
          ) : (
            /* Empty state */
            <EmptyState
              icon="📚"
              title="Votre bibliothèque est vide"
              subtitle="Commencez votre voyage sensoriel"
              description="Importez un livre (EPUB ou TXT) pour explorer l'expérience SensualRead avec votre appareil Lovense."
              action={
                <PremiumButton
                  onPress={() => navigation.navigate('Reader', undefined)}
                  label="Importer un livre"
                  icon="➕"
                  variant="primary"
                  size="large"
                />
              }
            />
          )}

          {/* Spacer for bottom */}
          <View style={{ height: Spacing.xl }} />
        </ScrollView>

        <Modal
          visible={scanModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setScanModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Scanner les livres</Text>

              {scanning ? (
                <View style={styles.modalCenter}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Recherche en cours…</Text>
                </View>
              ) : candidates.length === 0 ? (
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Aucun nouveau livre trouvé.</Text>
              ) : (
                <FlatList
                  data={candidates}
                  keyExtractor={(item) => item.path}
                  style={styles.candidateList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.candidateRow}
                      onPress={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.path)) next.delete(item.path);
                          else next.add(item.path);
                          return next;
                        });
                      }}
                    >
                      <View style={[
                        styles.checkbox,
                        selected.has(item.path) && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.candidateName, { color: colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.candidateSize, { color: colors.textSecondary }]}>
                          {item.sizeKB} KB · {item.type.toUpperCase()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: colors.border }]}
                  onPress={() => setScanModalVisible(false)}
                >
                  <Text style={{ color: colors.text }}>Annuler</Text>
                </TouchableOpacity>
                {!scanning && candidates.length > 0 && (
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                    onPress={handleBulkImport}
                    disabled={importing || selected.size === 0}
                  >
                    {importing
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: '#fff' }}>Importer ({selected.size})</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  headerTop: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerRight: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  settingsButton: {
    padding: Spacing.sm,
  },
  settingsIcon: {
    fontSize: 22,
    color: '#fff',
  },
  title: {
    ...Typography.h1,
  },
  subtitle: {
    ...Typography.body,
    marginTop: Spacing.xs,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionText: {
    ...Typography.button,
  },
  library: {
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  bookCard: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  bookCover: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  bookEmoji: {
    fontSize: 32,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  bookInfo: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  bookTitle: {
    ...Typography.h4,
    marginBottom: 2,
  },
  bookAuthor: {
    ...Typography.bodySmall,
    marginBottom: Spacing.xs,
  },
  bookMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookProgress: {
    ...Typography.caption,
  },
  bookDate: {
    ...Typography.caption,
    marginTop: 2,
  },
  progressBar: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: '100%',
  },
  emptyState: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h3,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  howItWorks: {
    width: '100%',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  howTitle: {
    ...Typography.h4,
    marginBottom: Spacing.md,
  },
  howStep: {
    ...Typography.body,
    marginBottom: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
  modalCenter: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  candidateList: {
    maxHeight: 300,
    marginBottom: 12,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
  },
  candidateName: {
    fontSize: 14,
    fontWeight: '500',
  },
  candidateSize: {
    fontSize: 12,
    marginTop: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
});

export default HomeScreen;
