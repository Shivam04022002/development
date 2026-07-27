import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { FontAwesome5, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

const SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/surjitfinance',
  instagram: 'https://www.instagram.com/surjitfinance',
  twitter: 'https://x.com/surjitfinance',
  linkedin: 'https://www.linkedin.com/company/surjitfinance/',
  youtube: 'https://www.youtube.com/@surjitfinance',
};

const CONTACT_INFO = {
  mail: 'mailto:info@surjitfinance.com',
  phone: 'tel:18003131265',
};

const Footer = () => {
  const openLink = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.warn("Couldn't open URL:", url);
    }
  };

  return (
    <View style={styles.container}>
      {/* Branding Header */}
      <View style={styles.brandingHeader}>
        <Text style={styles.brandTitle}>Surjit Finance</Text>
        <Text style={styles.tagline}>Empowering your financial journey</Text>
      </View>
      
      {/* Social Media Links */}
      <View style={styles.socialContainer}>
        <TouchableOpacity style={styles.iconButton} onPress={() => openLink(SOCIAL_LINKS.facebook)} activeOpacity={0.7}>
          <FontAwesome5 name="facebook-f" size={20} color="#1877F2" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => openLink(SOCIAL_LINKS.instagram)} activeOpacity={0.7}>
          <FontAwesome5 name="instagram" size={22} color="#E4405F" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => openLink(SOCIAL_LINKS.twitter)} activeOpacity={0.7}>
          {/* Using X/Twitter black color */}
          <FontAwesome5 name="twitter" size={20} color="#000000" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => openLink(SOCIAL_LINKS.linkedin)} activeOpacity={0.7}>
          <FontAwesome5 name="linkedin-in" size={20} color="#0A66C2" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => openLink(SOCIAL_LINKS.youtube)} activeOpacity={0.7}>
          <FontAwesome5 name="youtube" size={18} color="#FF0000" />
        </TouchableOpacity>
      </View>

      {/* Contact Cards */}
      <View style={styles.contactContainer}>
        <TouchableOpacity style={styles.contactRow} onPress={() => openLink(CONTACT_INFO.mail)} activeOpacity={0.7}>
          <View style={[styles.contactIconBg, { backgroundColor: '#ffe8cc' }]}>
            <Ionicons name="mail-outline" size={22} color="#FF9100" />
          </View>
          <View style={styles.contactTextContainer}>
            <Text style={styles.contactLabel}>Email Us</Text>
            <Text style={styles.contactText}>info@surjitfinance.com</Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.contactDivider} />

        <TouchableOpacity style={styles.contactRow} onPress={() => openLink(CONTACT_INFO.phone)} activeOpacity={0.7}>
          <View style={[styles.contactIconBg, { backgroundColor: '#e2f5e9' }]}>
            <Ionicons name="call-outline" size={22} color="#34C759" />
          </View>
          <View style={styles.contactTextContainer}>
            <Text style={styles.contactLabel}>Call Support</Text>
            <Text style={styles.contactText}>1800-3131-265</Text>
          </View>
        </TouchableOpacity>
      </View>
      
      <View style={styles.divider} />
      <Text style={styles.copyright}>© {new Date().getFullYear()} Surjit Finance. All rights reserved.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff6ec',  // Light warm theme matching Dashboard cards
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    marginTop: 20,
    alignItems: 'center',
    shadowColor: '#A34B1A',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 145, 0, 0.1)',
  },
  brandingHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: '#A34B1A', // Dark Orange/Brown
    marginBottom: 4,
    letterSpacing: 0.6,
  },
  tagline: {
    fontSize: 14,
    color: '#8A5A44',
    fontWeight: '500',
  },
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
    width: '100%',
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  contactContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#fefefe',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  contactDivider: {
    height: 1,
    backgroundColor: '#f2e8dd',
    marginVertical: 10,
    marginLeft: 64, // Aligns with text start
  },
  contactIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contactTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  contactLabel: {
    fontSize: 12,
    color: '#A0A0A0',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  contactText: {
    fontSize: 16,
    color: '#333333',
    fontWeight: '700',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(215, 185, 155, 0.4)',
    marginBottom: 20,
  },
  copyright: {
    fontSize: 13,
    color: '#9E7A66',
    fontWeight: '500',
  },
});

export default Footer;
